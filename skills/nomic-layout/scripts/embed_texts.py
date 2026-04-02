#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["muna", "python-dotenv", "typer"]
# ///

from dotenv import load_dotenv
from enum import Enum
from json import loads
from muna import Muna
from pathlib import Path
import sys
from typing import Annotated
import numpy as np
from typer import Argument, Exit, Option, Typer

EMBEDDING_MODEL_TAG = "@nomic/nomic-embed-text-v1.5"
EMBEDDING_DIM = 768
BATCH_SIZE = 16
MAX_CHARS = 2048

class Task(str, Enum):
    search_document = "search_document"
    search_query = "search_query"

app = Typer(add_completion=False)

@app.command()
def main(
    input_json: Annotated[Path, Argument(
        help="JSON file containing a list of strings to embed",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    output_npy: Annotated[Path, Argument(
        help="Output path for the .npy embeddings file",
    )],
    task: Annotated[Task, Option(
        "--task",
        help="Embedding task type",
    )]=Task.search_document,
) -> None:
    """
    Embed a list of texts using nomic-embed-text-v1.5.

    Reads a JSON array of strings from INPUT_JSON, embeds each text with
    nomic-embed-text-v1.5 via Muna, and saves the resulting vectors to
    OUTPUT_NPY as a numpy array with shape (N, 768).
    """
    # Create Muna client
    load_dotenv(".env")
    load_dotenv(".env.local")
    muna = Muna()
    # Load text to embed
    texts = loads(input_json.read_text())
    if not isinstance(texts, list):
        print(f"Expected a JSON array, got {type(texts).__name__}", file=sys.stderr)
        raise Exit(code=1)
    texts = [t[:MAX_CHARS] for t in texts]
    # Embed
    print(f"Embedding {len(texts)} texts (task={task.value})...", file=sys.stderr)
    try:
        vectors = _embed_texts(texts, muna=muna, task=task.value)
    except Exception as e:
        print(f"Embedding failed: {e}", file=sys.stderr)
        raise Exit(code=1)
    # Save embeddings
    np.save(str(output_npy), vectors)
    print(f"Saved embeddings with shape {vectors.shape} to {output_npy}", file=sys.stderr)

def _embed_texts(
    texts: list[str],
    *,
    muna: Muna,
    task: str=Task.search_document,
) -> np.ndarray:
    """
    Embed all texts in batches, returning a single (N, 768) array.
    """
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)
    all_embeddings: list[np.ndarray] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        all_embeddings.append(_embed_batch(batch, muna=muna, task=task))
    return np.concatenate(all_embeddings, axis=0)

def _embed_batch(
    batch: list[str],
    *,
    muna: Muna,
    task: str,
) -> np.ndarray:
    """
    Embed a single batch and return the resulting vectors.
    """
    prediction = muna.predictions.create(
        tag=EMBEDDING_MODEL_TAG,
        inputs={ "texts": batch, "task": task, "dimensions": EMBEDDING_DIM },
    )
    if prediction.error:
        raise RuntimeError(prediction.error)
    return prediction.results[0]

if __name__ == "__main__":
    app()
