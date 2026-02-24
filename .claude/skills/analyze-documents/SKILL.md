---
name: analyze-documents
description: Use when the user provides a directory of PDF documents and asks a question about their contents (e.g. "what diagrams show the relationship between X and Y?", "find tables about pricing", "summarize the findings").
argument-hint: <directory_path> --query "user question"
---
Index and search PDF documents in the directory provided in $ARGUMENTS using layout detection, OCR, and semantic embeddings.

Run: /home/anon/Work/fxn.ai/Code/src/current/nomic-layout-demo/.venv/bin/python /home/anon/Work/fxn.ai/Code/src/current/nomic-layout-demo/.claude/skills/analyze-documents/tools.py $ARGUMENTS

Use the Python interpreter from the project venv (or set the PYTHON env var to override which interpreter subprocesses use).

Required flags:
  --query "the user's question about the documents"

Optional flags:
  --top-k N           Number of results to return (default: 10)
  --min-score F       Minimum similarity score to include a result, 0.0-1.0 (default: 0.0, no filtering)
  --rebuild           Force re-index all documents from scratch

If you get an ImportError, install missing packages with:
  pip install muna pymupdf rapidocr-onnxruntime lancedb pyarrow Pillow

The tool indexes documents by:
1. Detecting layout regions (text, tables, headers, pictures, etc.) on every page
2. Extracting text from each region via PyMuPDF with RapidOCR fallback
3. Embedding extracted text with nomic-embed-text-v1.5 into a LanceDB vector database
4. Caching the index so subsequent queries are fast (only new/changed files are re-indexed)

The tool outputs JSON with matching document regions. Each result includes: document_name, page_number, roi_label, text, similarity_score, and bounding_box. It also saves annotated page images highlighting the matched regions and includes their file paths in the output.

Present the results to the user, summarizing the most relevant passages found. If annotated images were generated, show them to the user using their file paths.
