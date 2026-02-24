"""
Compute which PDF files need indexing.

Lightweight script — no ML imports. Reads the manifest from the cache
directory, compares against current files, and outputs JSON to stdout:

  {
    "to_index": ["file1.pdf", "file2.pdf"],
    "to_remove": ["old.pdf"],
    "all_docs": ["file1.pdf", "file2.pdf", "file3.pdf"]
  }
"""

import json
import sys
from pathlib import Path

CACHE_DIR_NAME = ".analyze-documents-cache"
MANIFEST_FILE = "manifest.json"


def scan_documents(directory: Path) -> list[Path]:
    pdfs = sorted(directory.glob("*.pdf")) + sorted(directory.glob("*.PDF"))
    seen = set()
    unique = []
    for p in pdfs:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            unique.append(p)
    return unique


def load_manifest(cache_dir: Path) -> dict:
    manifest_path = cache_dir / MANIFEST_FILE
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def get_file_info(file_path: Path) -> dict:
    st = file_path.stat()
    return {"mtime": st.st_mtime, "size": st.st_size}


def main():
    directory = Path(sys.argv[1]).resolve()
    rebuild = "--rebuild" in sys.argv[2:]

    cache_dir = directory / CACHE_DIR_NAME
    manifest = {} if rebuild else load_manifest(cache_dir)
    doc_paths = scan_documents(directory)

    to_index = []
    for p in doc_paths:
        name = p.name
        info = get_file_info(p)
        if name not in manifest:
            to_index.append(name)
        elif (manifest[name]["mtime"] != info["mtime"]
              or manifest[name]["size"] != info["size"]):
            to_index.append(name)

    current_names = {p.name for p in doc_paths}
    to_remove = [n for n in manifest if n not in current_names]

    output = {
        "to_index": to_index,
        "to_remove": to_remove,
        "all_docs": [p.name for p in doc_paths],
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
