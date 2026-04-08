#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["lancedb", "numpy", "pydantic", "typer"]
# ///

from lancedb import connect as connect_db
import numpy as np
from pathlib import Path
from pydantic import BaseModel, Field
from rich import print_json
import sys
from typer import Argument, Exit, Option, Typer
from typing import Annotated

CACHE_DIR_NAME = ".nomic/layout"
TABLE_NAME = "document_rois"

class BoundingBox(BaseModel):
    x_min: float = Field(description="Normalized minimum X coordinate.")
    y_min: float = Field(description="Normalized minimum Y coordinate.")
    x_max: float = Field(description="Normalized maximum X coordinate.")
    y_max: float = Field(description="Normalized maximum Y coordinate.")

class SearchResult(BaseModel):
    document_name: str = Field(description="Name of the source PDF document.")
    page_number: int = Field(description="1-indexed page number within the document.")
    roi_index: int = Field(description="Index of the detected region on the page.")
    label: str = Field(description="Layout element label (e.g. Text, Table, Title).")
    text: str = Field(description="Extracted text content of the region.")
    similarity_score: float = Field(description="Cosine similarity score (0.0–1.0).")
    bounding_box: BoundingBox = Field(description="Normalized bounding box coordinates.")
    confidence: float = Field(description="Detection confidence score from layout model.")

class SearchOutput(BaseModel):
    results: list[SearchResult] = Field(description="Matching document regions, sorted by similarity.")
    num_rois_indexed: int = Field(description="Total number of ROIs in the index.")

app = Typer(add_completion=False)

@app.command()
def main(
    directory: Annotated[Path, Argument(
        help="Document directory containing .nomic/layout/ index",
        exists=True,
        file_okay=False,
        resolve_path=True,
    )],
    query_vector: Annotated[Path, Option(
        "--query-vector",
        help=".npy file with the query embedding vector (shape (1, 768))",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    top_k: Annotated[int, Option(
        "--top-k",
        help="Number of results to return",
    )]=10,
    min_score: Annotated[float, Option(
        "--min-score",
        help="Minimum similarity score (0.0-1.0) to include a result",
    )]=0.0,
) -> None:
    """
    Query the LanceDB vector index for similar document regions.

    Loads a query vector from --query-vector, searches the LanceDB index at
    <directory>/.nomic/layout/lancedb/, and prints matching results as JSON
    to stdout.
    """
    # Check DB exists
    db_path = directory / CACHE_DIR_NAME / "lancedb"
    if not db_path.exists():
        print(f"No index found at {db_path}", file=sys.stderr)
        raise Exit(code=1)
    # Connect to DB
    db = connect_db(str(db_path))
    if TABLE_NAME not in db.list_tables().tables:
        print_json(data=SearchOutput(results=[], num_rois_indexed=0).model_dump())
        return
    # Search
    table = db.open_table(TABLE_NAME)
    vec = np.load(str(query_vector))
    if vec.ndim == 2:
        vec = vec[0]
    raw_results = (
        table.search(vec.tolist())
        .metric("cosine")
        .limit(top_k)
        .to_list()
    )
    # Build results
    all_results = [SearchResult(
        document_name=r["document_name"],
        page_number=r["page_number"],
        roi_index=r["roi_index"],
        label=r["label"],
        text=r["text"],
        similarity_score=round(1.0 - r.get("_distance", 0.0), 4),
        bounding_box=BoundingBox(
            x_min=r["x_min"],
            y_min=r["y_min"],
            x_max=r["x_max"],
            y_max=r["y_max"],
        ),
        confidence=r["confidence"],
    ) for r in raw_results]
    filtered = [r for r in all_results if r.similarity_score >= min_score]
    output = SearchOutput(results=filtered, num_rois_indexed=table.count_rows())
    # Print
    print_json(data=output.model_dump())

if __name__ == "__main__":
    app()
