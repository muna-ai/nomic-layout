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
BATCH_SIZE = 96


def embed_texts(texts: list[str], task: str = "search_document") -> np.ndarray:
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    muna = Muna()
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        prediction = muna.predictions.create(
            tag="@nomic/nomic-embed-text-v1.5",
            inputs={
                "texts": batch,
                "task": task,
                "dimensions": EMBEDDING_DIM,
            },
        )
        all_embeddings.append(np.asarray(prediction.results[0], dtype=np.float32))
    return np.concatenate(all_embeddings, axis=0)


if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    task = sys.argv[3] if len(sys.argv) > 3 else "search_document"

    texts = json.loads(open(input_path).read())
    print(f"Embedding {len(texts)} texts (task={task})...", file=sys.stderr)
    vectors = embed_texts(texts, task=task)
    np.save(output_path, vectors)
    print(f"Saved embeddings with shape {vectors.shape}.", file=sys.stderr)
