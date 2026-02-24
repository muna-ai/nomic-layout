#!/usr/bin/env bash
#
# Analyze Documents — Master orchestrator (shell script).
#
# Usage: tools.sh <directory> --query "question" [--top-k N] [--rebuild]
#
# Runs each heavy phase as a completely separate Python process to avoid
# memory conflicts. No Python subprocess.run() is used for model work —
# bash handles all process sequencing.
#

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="${PYTHON:-python3}"

# Parse arguments
DIRECTORY=""
QUERY=""
TOP_K=10
REBUILD=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --query) QUERY="$2"; shift 2 ;;
        --top-k) TOP_K="$2"; shift 2 ;;
        --rebuild) REBUILD="--rebuild"; shift ;;
        *) DIRECTORY="$1"; shift ;;
    esac
done

if [[ -z "$DIRECTORY" || -z "$QUERY" ]]; then
    echo '{"error": "Usage: tools.sh <directory> --query \"question\" [--top-k N] [--rebuild]"}' >&2
    exit 1
fi

DIRECTORY="$(cd "$DIRECTORY" && pwd)"
CACHE_DIR="$DIRECTORY/.analyze-documents-cache"
TMP_DIR="$(mktemp -d -t analyze-docs-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ---------------------------------------------------------------------------
# Step 1: Compute diff — which files need indexing?
# ---------------------------------------------------------------------------
DIFF_JSON=$("$PYTHON" "$SKILL_DIR/compute_diff.py" "$DIRECTORY" $REBUILD)
TO_INDEX=$(echo "$DIFF_JSON" | "$PYTHON" -c "import sys,json; print('\n'.join(json.load(sys.stdin)['to_index']))")
TO_REMOVE=$(echo "$DIFF_JSON" | "$PYTHON" -c "import sys,json; print(json.dumps(json.load(sys.stdin)['to_remove']))")

# Save removal list for phase 3
echo "$TO_REMOVE" > "$TMP_DIR/to_remove.json"

# ---------------------------------------------------------------------------
# Step 2: Layout detection — one process per document, completely isolated
# ---------------------------------------------------------------------------
ALL_RECORDS="[]"
INDEXED_FILES=""

if [[ -n "$TO_INDEX" ]]; then
    for DOC_NAME in $TO_INDEX; do
        DOC_PATH="$DIRECTORY/$DOC_NAME"
        STEM="${DOC_NAME%.*}"
        ROIS_JSON="$TMP_DIR/${STEM}_rois.json"

        echo "Indexing: $DOC_NAME" >&2
        if "$PYTHON" "$SKILL_DIR/detect_layout.py" "$DOC_PATH" "$ROIS_JSON"; then
            INDEXED_FILES="$INDEXED_FILES $ROIS_JSON"
        else
            echo "[error] Layout detection failed for $DOC_NAME" >&2
        fi
    done

    # Merge all ROI records into a single JSON array
    if [[ -n "$INDEXED_FILES" ]]; then
        ALL_RECORDS=$("$PYTHON" -c "
import json, sys
records = []
for path in sys.argv[1:]:
    data = json.loads(open(path).read())
    records.extend(data['records'])
print(json.dumps(records))
" $INDEXED_FILES)
    fi
fi

# Write merged records
echo "$ALL_RECORDS" > "$TMP_DIR/records.json"

# ---------------------------------------------------------------------------
# Step 3: Update manifest for indexed files
# ---------------------------------------------------------------------------
if [[ -n "$INDEXED_FILES" ]]; then
    "$PYTHON" -c "
import json, sys, os
from pathlib import Path

directory = Path(sys.argv[1])
cache_dir = directory / '.analyze-documents-cache'
cache_dir.mkdir(parents=True, exist_ok=True)
manifest_path = cache_dir / 'manifest.json'

rebuild = '--rebuild' in sys.argv[3:]
if rebuild:
    manifest = {}
elif manifest_path.exists():
    try:
        manifest = json.loads(manifest_path.read_text())
    except (json.JSONDecodeError, OSError):
        manifest = {}
else:
    manifest = {}

# Update manifest from ROI files
for rois_path in sys.argv[2].split():
    data = json.loads(open(rois_path).read())
    if data['records']:
        doc_name = data['records'][0]['document_name']
    else:
        continue
    doc_path = directory / doc_name
    st = doc_path.stat()
    manifest[doc_name] = {
        'mtime': st.st_mtime,
        'size': st.st_size,
        'num_pages': data['num_pages'],
    }

manifest_path.write_text(json.dumps(manifest, indent=2))
" "$DIRECTORY" "$INDEXED_FILES" $REBUILD
fi

# ---------------------------------------------------------------------------
# Step 4: Embed, store in LanceDB, query, and render
# ---------------------------------------------------------------------------
"$PYTHON" "$SKILL_DIR/orchestrate.py" \
    "$DIRECTORY" "$TMP_DIR" --query "$QUERY" --top-k "$TOP_K"
