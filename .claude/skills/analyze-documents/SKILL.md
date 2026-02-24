---
name: analyze-documents
description: Use when the user provides a directory of PDF documents and asks a question about their contents (e.g. "what diagrams show the relationship between X and Y?", "find tables about pricing", "summarize the findings").
argument-hint: <directory_path> --query "user question"
---
Index and search PDF documents in the directory provided in $ARGUMENTS using layout detection, OCR, and semantic embeddings.

Run: PYTHON=/path/to/venv/bin/python bash /home/anon/Work/fxn.ai/Code/src/current/nomic-layout-demo/.claude/skills/analyze-documents/tools.sh $ARGUMENTS

Set the PYTHON environment variable to the Python interpreter that has the required packages installed. If using a venv at the project root, use:
  PYTHON=/home/anon/Work/fxn.ai/Code/src/current/nomic-layout-demo/.venv/bin/python

Required flags:
  --query "the user's question about the documents"

Optional flags:
  --top-k N           Number of results to return (default: 10)
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
