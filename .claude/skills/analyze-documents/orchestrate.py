"""
Orchestrate document analysis: store embeddings in LanceDB, query, and render.

Reads records from layout detection and per-chunk embedding vectors produced by
tools.sh, writes them incrementally to LanceDB, then runs the vector query.
No heavy ML models are loaded in this process.
"""

import glob
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

_SKILL_DIR = Path(__file__).resolve().parent
CACHE_DIR_NAME = ".analyze-documents-cache"
MANIFEST_FILE = "manifest.json"
TABLE_NAME = "document_rois"
EMBEDDING_DIM = 768
DEFAULT_TOP_K = 10
DPI = 200

LABEL_COLORS = {
    "Title":             (255, 0, 0),
    "Text":              (0, 170, 0),
    "Section-header":    (0, 0, 255),
    "Table":             (255, 136, 0),
    "Picture":           (136, 0, 255),
    "List-item":         (0, 170, 170),
    "Key-Value Region":  (170, 0, 170),
    "Page-header":       (136, 136, 136),
    "Page-footer":       (170, 170, 170),
}


def _cache_dir(directory: Path) -> Path:
    return directory / CACHE_DIR_NAME


def load_manifest(cache_dir: Path) -> dict:
    manifest_path = cache_dir / MANIFEST_FILE
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_manifest(cache_dir: Path, manifest: dict):
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2))


def _get_schema():
    import pyarrow as pa
    return pa.schema([
        pa.field("document_name", pa.utf8()),
        pa.field("page_number", pa.int32()),
        pa.field("roi_index", pa.int32()),
        pa.field("label", pa.utf8()),
        pa.field("text", pa.utf8()),
        pa.field("x_min", pa.float32()),
        pa.field("y_min", pa.float32()),
        pa.field("x_max", pa.float32()),
        pa.field("y_max", pa.float32()),
        pa.field("confidence", pa.float32()),
        pa.field("vector", pa.list_(pa.float32(), EMBEDDING_DIM)),
    ])


def _has_table(db, name: str) -> bool:
    return name in db.list_tables().tables


def _add_to_table(db, records: list[dict]):
    """Add records to LanceDB, creating table if needed."""
    if _has_table(db, TABLE_NAME):
        db.open_table(TABLE_NAME).add(records)
    else:
        db.create_table(TABLE_NAME, data=records, schema=_get_schema())


def run(directory: Path, tmp_dir: Path, query: str, top_k: int):
    import lancedb

    cache = _cache_dir(directory)
    db_path = str(cache / "lancedb")
    db = lancedb.connect(db_path)
    manifest = load_manifest(cache)

    # Handle removals
    to_remove_path = tmp_dir / "to_remove.json"
    if to_remove_path.exists():
        to_remove = json.loads(to_remove_path.read_text())
        if to_remove and _has_table(db, TABLE_NAME):
            table = db.open_table(TABLE_NAME)
            for name in to_remove:
                escaped = name.replace("'", "''")
                table.delete(f"document_name = '{escaped}'")
                manifest.pop(name, None)
                print(f"Removed stale index for: {name}", file=sys.stderr)
            save_manifest(cache, manifest)

    # Load records from layout detection
    records_path = tmp_dir / "records.json"
    all_records = json.loads(records_path.read_text()) if records_path.exists() else []

    if all_records:
        # Delete old rows for re-indexed files
        if _has_table(db, TABLE_NAME):
            table = db.open_table(TABLE_NAME)
            doc_names = {r["document_name"] for r in all_records}
            for name in doc_names:
                escaped = name.replace("'", "''")
                table.delete(f"document_name = '{escaped}'")

        # Read per-chunk vectors and write to LanceDB incrementally
        chunk_files = sorted(
            glob.glob(str(tmp_dir / "vectors_chunk_*.npy")),
            key=lambda f: int(re.search(r"_(\d+)\.npy", f).group(1)),
        )
        offset = 0
        for chunk_path in chunk_files:
            vectors = np.load(chunk_path)
            batch = all_records[offset : offset + len(vectors)]
            for rec, vec in zip(batch, vectors):
                rec["vector"] = vec.tolist()
            _add_to_table(db, batch)
            offset += len(vectors)

        print(f"Indexed {len(all_records)} ROIs.", file=sys.stderr)

    # Query
    if not _has_table(db, TABLE_NAME):
        print(json.dumps({"query": query, "num_documents_indexed": 0, "num_rois_indexed": 0, "results": [], "annotated_pages": []}))
        return

    # Embed query via subprocess (tiny — just 1 text)
    query_json = tmp_dir / "query.json"
    query_vectors_path = tmp_dir / "query_vectors.npy"
    query_json.write_text(json.dumps([query]))
    result = subprocess.run(
        [sys.executable, str(_SKILL_DIR / "embed_texts.py"),
         str(query_json), str(query_vectors_path), "search_query"],
        capture_output=True, text=True,
    )
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    if result.returncode != 0:
        print(json.dumps({"error": f"Query embedding failed: {result.stderr}"}))
        sys.exit(1)

    query_vector = np.load(str(query_vectors_path))[0]

    table = db.open_table(TABLE_NAME)
    raw_results = (
        table.search(query_vector.tolist())
        .metric("cosine")
        .limit(top_k)
        .to_list()
    )

    results = []
    for r in raw_results:
        results.append({
            "document_name": r["document_name"],
            "page_number": r["page_number"],
            "roi_index": r["roi_index"],
            "label": r["label"],
            "text": r["text"],
            "similarity_score": round(1.0 - r.get("_distance", 0.0), 4),
            "bounding_box": {
                "x_min": r["x_min"], "y_min": r["y_min"],
                "x_max": r["x_max"], "y_max": r["y_max"],
            },
            "confidence": r["confidence"],
        })

    # Render annotated pages
    annotated = render_annotated_pages(results, directory)

    num_rois = table.count_rows()
    output = {
        "query": query,
        "num_documents_indexed": len(manifest),
        "num_rois_indexed": num_rois,
        "results": results,
        "annotated_pages": annotated,
    }
    print(json.dumps(output, indent=2))


def render_annotated_pages(results, directory):
    if not results:
        return []

    import pymupdf
    from PIL import Image, ImageDraw, ImageFont

    page_groups = {}
    for r in results:
        key = (r["document_name"], r["page_number"])
        page_groups.setdefault(key, []).append(r)

    out_dir = Path(tempfile.mkdtemp(prefix="analyze-docs-"))
    annotated = []

    for (doc_name, page_num), rois in page_groups.items():
        doc_path = directory / doc_name
        if not doc_path.exists():
            continue
        try:
            doc = pymupdf.open(str(doc_path))
            page = doc[page_num - 1]
            pix = page.get_pixmap(dpi=DPI)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            doc.close()
        except Exception:
            continue

        draw = ImageDraw.Draw(img)
        w, h = img.size
        for roi in rois:
            bb = roi["bounding_box"]
            color = LABEL_COLORS.get(roi["label"], (255, 255, 0))
            x0, y0 = int(bb["x_min"] * w), int(bb["y_min"] * h)
            x1, y1 = int(bb["x_max"] * w), int(bb["y_max"] * h)
            for offset in range(3):
                draw.rectangle((x0 - offset, y0 - offset, x1 + offset, y1 + offset), outline=color)
            label_text = f"{roi['label']} ({roi['similarity_score']:.2f})"
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
            except (OSError, IOError):
                font = ImageFont.load_default()
            text_bbox = draw.textbbox((x0, y0 - 18), label_text, font=font)
            draw.rectangle(text_bbox, fill=color)
            draw.text((x0, y0 - 18), label_text, fill=(255, 255, 255), font=font)

        safe_name = doc_name.replace("/", "_").replace(" ", "_")
        out_path = out_dir / f"{safe_name}_page{page_num}.png"
        img.save(str(out_path))
        annotated.append({"document_name": doc_name, "page_number": page_num, "image_path": str(out_path)})

    return annotated


if __name__ == "__main__":
    args = sys.argv[1:]
    directory = Path(args[0]).resolve()
    tmp_dir = Path(args[1])

    query = ""
    top_k = DEFAULT_TOP_K
    i = 2
    while i < len(args):
        if args[i] == "--query":
            query = args[i + 1]
            i += 2
        elif args[i] == "--top-k":
            top_k = int(args[i + 1])
            i += 2
        else:
            i += 1
    run(directory, tmp_dir, query, top_k)
