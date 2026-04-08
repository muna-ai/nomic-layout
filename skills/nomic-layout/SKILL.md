---
name: nomic-layout
description: Use when the user provides a directory of PDF documents and asks a question about their contents (e.g. "what diagrams show the relationship between X and Y?", "find tables about pricing", "summarize the findings").
---

Index and search PDF documents using layout detection, OCR, and semantic embeddings.

All scripts are self-contained and run with `uv run`. They live in the `scripts/` directory. You can run `--help` on each and every script to get a good understanding of wwhat each script does, and needs to run.

## Pipeline

Follow these steps in order. Each script prints JSON to stdout and progress to stderr. Capture stdout into files to pass between steps.

### Step 1: Check what needs indexing

```sh
# Check what needs indexing
$ uv run scripts/build_manifest.py <directory>
```

This prints JSON with `to_index` (new/changed files), `to_remove` (deleted files), and `all_docs`.
If `to_index` is empty and `to_remove` is empty, skip to Step 5 (query).
Add `--rebuild` to force re-indexing everything.

### Step 2: Detect layout and extract text

Run once per file in `to_index`:

```sh
# Detect layout elements and extract text
$ uv run scripts/detect_layout.py <pdf_path>
```

This prints JSON with `records` (list of ROI dicts with document_name, page_number, label, text, bounding box) and `num_pages`. Use the `--blip-remote` option to caption images using a remote A100 GPU which is usually faster.

Merge all records from all documents into a single JSON array and save to a temp file (e.g. `/tmp/records.json`). Also extract all `text` values from the records into a separate JSON array and save to a temp file (e.g. `/tmp/texts.json`).

### Step 3: Embed texts

```sh
# Embed texts
$ uv run scripts/embed_texts.py /tmp/texts.json /tmp/vectors.npy
```

This embeds all extracted texts using nomic-embed-text-v1.5 and saves vectors as a numpy array.

### Step 4: Build the index

```sh
# Build the index
$ uv run scripts/build_index.py <directory> --records /tmp/records.json --vectors /tmp/vectors.npy
```

This stores records and vectors in LanceDB at `<directory>/.nomic/layout/lancedb/` and updates the manifest. If `to_remove` from Step 1 was non-empty, also pass `--remove /tmp/to_remove.json` with a JSON array of filenames.

### Step 5: Embed the query

```sh
# Embed the user's query
$ echo '["the user question"]' > /tmp/query.json
$ uv run scripts/embed_texts.py /tmp/query.json /tmp/query_vec.npy --task search_query
```

### Step 6: Search the index

```sh
# Search the index
uv run scripts/query_index.py <directory> --query-vector /tmp/query_vec.npy
```

This prints JSON with `results` (matching regions with similarity scores and bounding boxes) and `num_rois_indexed`. You can use optional arguments: `--top-k N` (default 10), `--min-score F` (default 0.0).

### Step 7: Render annotated results

```sh
# Render annotated results
$ uv run scripts/render_result.py <directory> --results /tmp/results.json
```

This renders annotated page images with highlighted ROIs and produces a combined `annotated_results.pdf`. Optional: `-o /path/to/output_dir` to control where images are saved.

## Presenting results
- Summarize the most relevant passages found, citing document name, page number, and similarity score.
- The render step generates an annotated PDF (`annotated_results.pdf`) with one page per hit, showing the matched ROI highlighted with source and score annotations.
- ALWAYS ask the user if they would like to see the annotated PDF.

## Cache
The index is cached at `<directory>/.nomic/layout/` with a `manifest.json` tracking file mtimes and sizes. Subsequent queries skip already-indexed files. Use `--rebuild` in Step 1 to force a full re-index.

## Requirements
- `uv` must be installed. All Python dependencies are resolved automatically via inline PEP 723 metadata.
- A valid Muna access key must be available (via `MUNA_ACCESS_KEY` env var or `.env` / `.env.local` file in the working directory). If an access key is not available, ask the user to sign up and generate an access key at http://muna.ai/settings/developer
