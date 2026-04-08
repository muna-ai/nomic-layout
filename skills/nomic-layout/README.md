# nomic-layout

An AI agent skill for indexing and searching PDF documents using layout detection, OCR, and semantic embeddings.

Given a directory of PDFs, the skill detects layout regions (text, tables, headers, pictures, etc.) on every page using [nomic-layout-v1](https://www.muna.ai/@nomic/nomic-layout-v1), extracts text via PyMuPDF with RapidOCR fallback, optionally captions images with BLIP, and embeds everything into a LanceDB vector index for semantic search.

## Scripts

Each script is self-contained using [PEP 723](https://peps.python.org/pep-0723/) inline metadata and runs with `uv run`. Run any script with `--help` for full usage details.

| Script | Purpose |
|---|---|
| `build_manifest.py` | Scan a directory for new, changed, or removed PDFs |
| `detect_layout.py` | Run layout detection and text extraction on a single PDF |
| `embed_texts.py` | Embed texts using nomic-embed-text-v1.5 |
| `build_index.py` | Store records and vectors in a LanceDB index |
| `query_index.py` | Semantic search against the index |
| `render_result.py` | Render annotated page images highlighting matched regions |

## Requirements

- [`uv`](https://docs.astral.sh/uv/)
- A [Muna](https://muna.ai) access key (`MUNA_ACCESS_KEY` env var or `.env` file)
