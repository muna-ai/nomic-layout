#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["typer"]
# ///

from json import loads, JSONDecodeError
from pathlib import Path
from typing import Annotated
from rich import print_json
from typer import Argument, Option, Typer

CACHE_DIR_NAME = ".nomic/layout"
MANIFEST_FILE = "manifest.json"

app = Typer(add_completion=False)

@app.command()
def main(
    directory: Annotated[Path, Argument(
        help="Directory containing PDF documents",
        exists=True,
        file_okay=False,
        resolve_path=True
    )],
    rebuild: Annotated[bool, Option(
        "--rebuild",
        help="Ignore cached manifest and re-index everything"
    )]=False
) -> None:
    """
    Scan a directory of PDFs and compute which files need (re-)indexing.

    Compares current files against a cached manifest (mtime + size) and prints
    a JSON diff to stdout:

    {"to_index": [...], "to_remove": [...], "all_docs": [...]}
    """
    # Gather all PDFs
    cache_dir = directory / CACHE_DIR_NAME
    manifest = { } if rebuild else _load_manifest(cache_dir)
    doc_paths = _scan_documents(directory)
    # Build manifests
    to_index: list[str] = []
    for p in doc_paths:
        name = p.name
        st = p.stat()
        if name not in manifest:
            to_index.append(name)
        elif manifest[name]["mtime"] != st.st_mtime or manifest[name]["size"] != st.st_size:
            to_index.append(name)
    current_names = {p.name for p in doc_paths}
    to_remove = [n for n in manifest if n not in current_names]
    # Print result
    print_json(data={
        "to_index": to_index,
        "to_remove": to_remove,
        "all_docs": [p.name for p in doc_paths],
    })

def _load_manifest(cache_dir: Path) -> dict:
    """
    Load the manifest JSON from the cache directory.
    """
    manifest_path = cache_dir / MANIFEST_FILE
    if manifest_path.exists():
        try:
            return loads(manifest_path.read_text())
        except (JSONDecodeError, OSError):
            return {}
    return {}

def _scan_documents(directory: Path) -> list[Path]:
    """
    Find all PDF files in a directory, deduplicating by resolved path.
    """
    pdfs = sorted(directory.glob("*.pdf")) + sorted(directory.glob("*.PDF"))
    seen: set[Path] = set()
    unique: list[Path] = []
    for p in pdfs:
        resolved = p.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(p)
    return unique

if __name__ == "__main__":
    app()
