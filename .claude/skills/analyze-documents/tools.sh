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

    # Merge all ROI records directly to file (avoid large bash variables)
    if [[ -n "$INDEXED_FILES" ]]; then
        "$PYTHON" -c "
import json, sys
records = []
for path in sys.argv[1:]:
    data = json.loads(open(path).read())
    records.extend(data['records'])
open('$TMP_DIR/records.json', 'w').write(json.dumps(records))
" $INDEXED_FILES
    fi
fi

# Ensure records.json exists
if [[ ! -f "$TMP_DIR/records.json" ]]; then
    echo "[]" > "$TMP_DIR/records.json"
fi

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
# Step 4: Embed texts in chunks — each chunk is a fully isolated process
# ---------------------------------------------------------------------------
NUM_RECORDS=$("$PYTHON" -c "import json; print(len(json.loads(open('$TMP_DIR/records.json').read())))")
CHUNK_SIZE=100

if [[ "$NUM_RECORDS" -gt 0 ]]; then
    # Split texts into chunk files
    NUM_CHUNKS=$("$PYTHON" -c "
import json, math
records = json.loads(open('$TMP_DIR/records.json').read())
texts = [r['text'] for r in records]
chunk_size = $CHUNK_SIZE
num_chunks = math.ceil(len(texts) / chunk_size)
for i in range(num_chunks):
    chunk = texts[i*chunk_size : (i+1)*chunk_size]
    open(f'$TMP_DIR/texts_chunk_{i}.json', 'w').write(json.dumps(chunk))
print(num_chunks)
")

    echo "Embedding $NUM_RECORDS text regions in $NUM_CHUNKS chunk(s)..." >&2
    for (( i=0; i<NUM_CHUNKS; i++ )); do
        echo "  Embedding chunk $((i+1))/$NUM_CHUNKS..." >&2
        "$PYTHON" "$SKILL_DIR/embed_texts.py" \
            "$TMP_DIR/texts_chunk_${i}.json" "$TMP_DIR/vectors_chunk_${i}.npy" search_document
    done
fi

# ---------------------------------------------------------------------------
# Step 5: Store in LanceDB + query + render (lightweight, no model loading)
# ---------------------------------------------------------------------------
"$PYTHON" "$SKILL_DIR/orchestrate.py" \
    "$DIRECTORY" "$TMP_DIR" --query "$QUERY" --top-k "$TOP_K"
