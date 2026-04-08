#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["lancedb", "numpy", "pyarrow", "typer"]
# ///

from json import dumps, loads, JSONDecodeError
from lancedb import connect as connect_db, DBConnection
import numpy as np
from pathlib import Path
import pyarrow as pa
from sys import stderr
from typer import Argument, Exit, Option, Typer
from typing import Annotated, Optional

CACHE_DIR_NAME = ".nomic/layout"
MANIFEST_FILE = "manifest.json"
TABLE_NAME = "document_rois"
EMBEDDING_DIM = 768

app = Typer(add_completion=False)

@app.command()
def main(
    directory: Annotated[Path, Argument(
        help="Document directory (LanceDB index lives in <directory>/.nomic/layout/)",
        exists=True,
        file_okay=False,
        resolve_path=True,
    )],
    records: Annotated[Path, Option(
        "--records",
        help="JSON file with ROI records from detect_layout.py",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    vectors: Annotated[Path, Option(
        "--vectors",
        help=".npy file with embedding vectors from embed_texts.py",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    remove: Annotated[Path | None, Option(
        "--remove",
        help="JSON file with a list of document names to remove from the index",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )]=None,
) -> None:
    """
    Store ROI records and embedding vectors in a LanceDB index.

    Reads records from --records and vectors from --vectors, pairs them,
    and upserts into the LanceDB table at <directory>/.nomic/layout/lancedb/.
    Optionally removes stale documents listed in --remove.
    Updates the manifest file after indexing.
    """
    cache_dir = directory / CACHE_DIR_NAME
    cache_dir.mkdir(parents=True, exist_ok=True)
    db = connect_db(str(cache_dir / "lancedb"))
    manifest = _load_manifest(cache_dir)
    # Handle removals
    if remove is not None:
        to_remove: list[str] = loads(remove.read_text())
        if to_remove and _has_table(db, TABLE_NAME):
            table = db.open_table(TABLE_NAME)
            for name in to_remove:
                escaped = name.replace("'", "''")
                table.delete(f"document_name = '{escaped}'")
                manifest.pop(name, None)
                print(f"Removed: {name}", file=stderr)
            _save_manifest(cache_dir, manifest)
    # Load records and vectors
    all_records: list[dict] = loads(records.read_text())
    all_vectors: np.ndarray = np.load(str(vectors))
    if len(all_records) != len(all_vectors):
        print(
            f"Record count ({len(all_records)}) != vector count ({len(all_vectors)})",
            file=stderr,
        )
        raise Exit(code=1)
    if not all_records:
        print("No records to index.", file=stderr)
        return
    # Delete old rows for re-indexed documents
    if _has_table(db, TABLE_NAME):
        table = db.open_table(TABLE_NAME)
        doc_names = {r["document_name"] for r in all_records}
        for name in doc_names:
            escaped = name.replace("'", "''")
            table.delete(f"document_name = '{escaped}'")
    # Attach vectors and write to LanceDB
    for rec, vec in zip(all_records, all_vectors):
        rec["vector"] = vec.tolist()
    _add_to_table(db, all_records)
    # Update manifest with indexed documents
    for rec in all_records:
        doc_name = rec["document_name"]
        if doc_name not in manifest:
            doc_path = directory / doc_name
            if doc_path.exists():
                st = doc_path.stat()
                manifest[doc_name] = {"mtime": st.st_mtime, "size": st.st_size}
    _save_manifest(cache_dir, manifest)
    print(f"Indexed {len(all_records)} ROIs.", file=stderr)

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

def _save_manifest(cache_dir: Path, manifest: dict) -> None:
    """
    Write the manifest JSON to the cache directory.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / MANIFEST_FILE).write_text(dumps(manifest, indent=2))

def _get_schema() -> pa.Schema:
    """
    Return the PyArrow schema for the LanceDB table.
    """
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

def _has_table(db: DBConnection, name: str) -> bool:
    """
    Check if a table exists in the LanceDB database.
    """
    return name in db.list_tables().tables

def _add_to_table(db: DBConnection, records: list[dict]) -> None:
    """
    Add records to the LanceDB table, creating it if it doesn't exist.
    """
    if _has_table(db, TABLE_NAME):
        db.open_table(TABLE_NAME).add(records)
    else:
        db.create_table(TABLE_NAME, data=records, schema=_get_schema())

if __name__ == "__main__":
    app()
