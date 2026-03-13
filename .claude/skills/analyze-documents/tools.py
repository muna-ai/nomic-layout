"""
Analyze Documents — Master orchestrator.

Usage: python tools.py <directory> --query "question" [--top-k N] [--min-score F] [--rebuild]

Runs each heavy phase as a completely separate Python subprocess to avoid
memory conflicts. This script only imports stdlib — no ML libraries are
loaded in the orchestrator process, keeping fork() overhead minimal.
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent
CHUNK_SIZE = 100


def _python():
    """Return the Python interpreter path."""
    return os.environ.get("PYTHON", sys.executable)


def _run(args, check=True, capture_output=False):
    """Run a subprocess, raising on failure by default."""
    return subprocess.run(args, check=check, capture_output=capture_output, text=True)


def _run_capture(args):
    """Run a subprocess and return stdout."""
    result = _run(args, capture_output=True)
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description="Analyze documents via layout detection + semantic search")
    parser.add_argument("directory", help="Directory containing PDF documents")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--top-k", type=int, default=10, help="Number of results (default: 10)")
    parser.add_argument("--min-score", type=float, default=0.0, help="Minimum similarity score (default: 0.0)")
    parser.add_argument("--rebuild", action="store_true", help="Force re-index all documents")
    parser.add_argument("--blip-remote", action="store_true", help="Run BLIP image captioning on remote A100 GPU")
    args = parser.parse_args()

    directory = Path(args.directory).resolve()
    if not directory.is_dir():
        print(json.dumps({"error": f"Not a directory: {directory}"}), file=sys.stderr)
        sys.exit(1)

    python = _python()
    tmp_dir = Path(tempfile.mkdtemp(prefix="analyze-docs-"))

    try:
        _pipeline(python, directory, tmp_dir, args)
    finally:
        # Clean up temp dir (but not the annotated output dir created by orchestrate.py)
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _pipeline(python, directory, tmp_dir, args):
    pipeline_t0 = time.monotonic()
    doc_timings = []

    # -----------------------------------------------------------------------
    # Step 1: Compute diff — which files need indexing?
    # -----------------------------------------------------------------------
    diff_args = [python, str(SKILL_DIR / "compute_diff.py"), str(directory)]
    if args.rebuild:
        diff_args.append("--rebuild")
    diff_json = json.loads(_run_capture(diff_args))
    to_index = diff_json["to_index"]
    to_remove = diff_json["to_remove"]

    # Save removal list for orchestrate.py
    (tmp_dir / "to_remove.json").write_text(json.dumps(to_remove))

    # -----------------------------------------------------------------------
    # Step 2: Layout detection — one process per document, completely isolated
    # -----------------------------------------------------------------------
    indexed_rois_files = []

    for doc_name in to_index:
        doc_path = directory / doc_name
        stem = Path(doc_name).stem
        rois_json = tmp_dir / f"{stem}_rois.json"

        print(f"Indexing: {doc_name}", file=sys.stderr)
        detect_cmd = [python, str(SKILL_DIR / "detect_layout.py"), str(doc_path), str(rois_json)]
        if args.blip_remote:
            detect_cmd.append("--blip-remote")
        result = _run(detect_cmd, check=False)
        if result.returncode == 0:
            indexed_rois_files.append(rois_json)
        else:
            print(f"[error] Layout detection failed for {doc_name}", file=sys.stderr)

    # Merge all ROI records into a single file and collect per-doc timing
    if indexed_rois_files:
        all_records = []
        for rois_path in indexed_rois_files:
            data = json.loads(rois_path.read_text())
            all_records.extend(data["records"])
            if "timing" in data:
                doc_timings.append({"document": data["records"][0]["document_name"] if data["records"] else rois_path.stem, **data["timing"]})
        (tmp_dir / "records.json").write_text(json.dumps(all_records))

    # Ensure records.json exists
    records_path = tmp_dir / "records.json"
    if not records_path.exists():
        records_path.write_text("[]")

    # -----------------------------------------------------------------------
    # Step 3: Update manifest for indexed files
    # -----------------------------------------------------------------------
    if indexed_rois_files:
        cache_dir = directory / ".analyze-documents-cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = cache_dir / "manifest.json"

        if args.rebuild:
            manifest = {}
        elif manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text())
            except (json.JSONDecodeError, OSError):
                manifest = {}
        else:
            manifest = {}

        for rois_path in indexed_rois_files:
            data = json.loads(rois_path.read_text())
            if not data["records"]:
                continue
            doc_name = data["records"][0]["document_name"]
            doc_path = directory / doc_name
            st = doc_path.stat()
            manifest[doc_name] = {
                "mtime": st.st_mtime,
                "size": st.st_size,
                "num_pages": data["num_pages"],
            }

        manifest_path.write_text(json.dumps(manifest, indent=2))

    # -----------------------------------------------------------------------
    # Step 4: Embed texts in chunks — each chunk is a fully isolated process
    # -----------------------------------------------------------------------
    all_records = json.loads(records_path.read_text())
    num_records = len(all_records)

    embed_timing = {"total_s": 0, "num_texts": 0, "num_chunks": 0}
    if num_records > 0:
        texts = [r["text"] for r in all_records]
        num_chunks = math.ceil(len(texts) / CHUNK_SIZE)
        embed_timing["num_texts"] = len(texts)
        embed_timing["num_chunks"] = num_chunks

        # Write chunk files
        for i in range(num_chunks):
            chunk = texts[i * CHUNK_SIZE : (i + 1) * CHUNK_SIZE]
            (tmp_dir / f"texts_chunk_{i}.json").write_text(json.dumps(chunk))

        print(f"Embedding {num_records} text regions in {num_chunks} chunk(s)...", file=sys.stderr)
        embed_t0 = time.monotonic()
        for i in range(num_chunks):
            print(f"  Embedding chunk {i + 1}/{num_chunks}...", file=sys.stderr)
            _run([
                python, str(SKILL_DIR / "embed_texts.py"),
                str(tmp_dir / f"texts_chunk_{i}.json"),
                str(tmp_dir / f"vectors_chunk_{i}.npy"),
                "search_document",
            ])
        embed_timing["total_s"] = round(time.monotonic() - embed_t0, 2)

    # -----------------------------------------------------------------------
    # Step 5: Store in LanceDB + query + render (lightweight, no model loading)
    # -----------------------------------------------------------------------
    orchestrate_t0 = time.monotonic()
    orchestrate_args = [
        python, str(SKILL_DIR / "orchestrate.py"),
        str(directory), str(tmp_dir),
        "--query", args.query,
        "--top-k", str(args.top_k),
    ]
    if args.min_score > 0:
        orchestrate_args.extend(["--min-score", str(args.min_score)])
    orchestrate_result = _run(orchestrate_args, capture_output=True)
    orchestrate_elapsed = round(time.monotonic() - orchestrate_t0, 2)

    # Print orchestrate stderr through
    if orchestrate_result.stderr:
        print(orchestrate_result.stderr, end="", file=sys.stderr)

    # Inject timing into output JSON
    pipeline_elapsed = round(time.monotonic() - pipeline_t0, 2)
    # orchestrate.py prints JSON to stdout, but MuPDF warnings may precede it
    stdout = orchestrate_result.stdout
    json_start = stdout.find("{")
    try:
        output = json.loads(stdout[json_start:]) if json_start >= 0 else json.loads(stdout)
        output["_timing"] = {
            "pipeline_total_s": pipeline_elapsed,
            "documents": doc_timings,
            "embedding": embed_timing,
            "query_and_render_s": orchestrate_elapsed,
        }
        print(json.dumps(output, indent=2))
    except (json.JSONDecodeError, ValueError):
        # If orchestrate output isn't JSON, pass it through as-is
        print(stdout, end="")


if __name__ == "__main__":
    main()
