---
name: analyze-documents
description: Use when the user provides a directory of PDF documents and asks a question about their contents (e.g. "what diagrams show the relationship between X and Y?", "find tables about pricing", "summarize the findings").
argument-hint: <directory_path> --query "user question"
---
Index and search PDF documents in the directory provided in $ARGUMENTS using layout detection, OCR, and semantic embeddings.

Run: python3 ~/.claude/skills/analyze-documents/tools.py $ARGUMENTS

Set the PYTHON environment variable if the default python3 doesn't have the required packages:
  PYTHON=/path/to/venv/bin/python python3 ~/.claude/skills/analyze-documents/tools.py $ARGUMENTS

Required flags:
  --query "the user's question about the documents"

Optional flags:
  --top-k N           Number of results to return (default: 10)
  --min-score F       Minimum similarity score to include a result, 0.0-1.0 (default: 0.0, no filtering)
  --rebuild           Force re-index all documents from scratch

If you get an ImportError, install missing packages with:
  pip install muna pymupdf lancedb pyarrow Pillow

The tool indexes documents by:
1. Detecting layout regions (text, tables, headers, pictures, etc.) on every page
2. Extracting text from each region via PyMuPDF with RapidOCR (via Muna) fallback
3. Embedding extracted text with nomic-embed-text-v1.5 into a LanceDB vector database
4. Caching the index so subsequent queries are fast (only new/changed files are re-indexed)

The tool outputs JSON with matching document regions. Each result includes: document_name, page_number, roi_label, text, similarity_score, and bounding_box. It also saves annotated page images highlighting the matched regions and includes their file paths in the output.

Present the results to the user, summarizing the most relevant passages found. The tool generates an annotated results PDF (`annotated_results.pdf`) containing one page per query hit, with the matched ROI highlighted and annotated with the source document name and similarity score. After presenting the results, ALWAYS ask the user if they would like to see the annotated PDF.
