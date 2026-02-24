"""
Phase 2: Embed extracted texts using nomic-embed-text-v1.5 via Muna.

Usage: python embed_texts.py <input_json_path> <output_npy_path> [--task TASK]

Reads texts from input JSON (list of strings), embeds them, and writes
the resulting vectors to a .npy file.
"""

import json
import sys

import numpy as np
from muna import Muna

EMBEDDING_DIM = 768
BATCH_SIZE = 32
MAX_CHARS = 2048  # Truncate long texts to avoid ONNX attention memory explosion


def _embed_batch(muna, batch: list[str], task: str) -> np.ndarray:
    """Embed a single batch, retrying with smaller batches on failure."""
    try:
        prediction = muna.predictions.create(
            tag="@nomic/nomic-embed-text-v1.5",
            inputs={"texts": batch, "task": task, "dimensions": EMBEDDING_DIM},
        )
        if prediction.results is None or prediction.results[0] is None:
            raise RuntimeError("Embedding returned None results")
        return np.asarray(prediction.results[0], dtype=np.float32)
    except Exception as e:
        if len(batch) == 1:
            print(f"  [warn] Failed to embed text ({len(batch[0])} chars): {e}", file=sys.stderr)
            return np.zeros((1, EMBEDDING_DIM), dtype=np.float32)
        # Split in half and retry
        mid = len(batch) // 2
        print(f"  [warn] Batch of {len(batch)} failed, retrying as 2x{mid}...", file=sys.stderr)
        left = _embed_batch(muna, batch[:mid], task)
        right = _embed_batch(muna, batch[mid:], task)
        return np.concatenate([left, right], axis=0)


def embed_texts(texts: list[str], task: str = "search_document") -> np.ndarray:
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    muna = Muna()
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        all_embeddings.append(_embed_batch(muna, batch, task))
    return np.concatenate(all_embeddings, axis=0)


if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    task = sys.argv[3] if len(sys.argv) > 3 else "search_document"

    texts = json.loads(open(input_path).read())
    texts = [t[:MAX_CHARS] for t in texts]
    print(f"Embedding {len(texts)} texts (task={task})...", file=sys.stderr)
    vectors = embed_texts(texts, task=task)
    np.save(output_path, vectors)
    print(f"Saved embeddings with shape {vectors.shape}.", file=sys.stderr)
