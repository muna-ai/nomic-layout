"""
Benchmark layout detection only - no OCR, BLIP, or embedding.
"""
import json
import sys
import time
from pathlib import Path

import pymupdf
from PIL import Image
from muna import Muna

# Configuration
PREDICTOR_TAG = sys.argv[1] if len(sys.argv) > 1 else "@nomic/nomic-layout-v1-mlx"
DOCS_DIR = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("test-docs-images")
DPI = 200
DEFAULT_THRESHOLD = 0.5

def detect_layout(muna: Muna, image: Image.Image, tag: str) -> list[dict]:
    prediction = muna.predictions.create(
        tag=tag,
        inputs={
            "image": image,
            "picture_threshold": DEFAULT_THRESHOLD,
            "footer_threshold": DEFAULT_THRESHOLD,
            "header_threshold": DEFAULT_THRESHOLD,
            "key_value_threshold": DEFAULT_THRESHOLD,
            "list_item_threshold": DEFAULT_THRESHOLD,
            "section_header_threshold": DEFAULT_THRESHOLD,
            "table_threshold": DEFAULT_THRESHOLD,
            "text_threshold": DEFAULT_THRESHOLD,
            "title_threshold": DEFAULT_THRESHOLD,
        },
    )
    return prediction.results[0]

def process_pdf(pdf_path: Path, tag: str) -> dict:
    muna = Muna()
    doc = pymupdf.open(str(pdf_path))
    num_pages = len(doc)

    print(f"\nProcessing: {pdf_path.name}")
    print(f"  Predictor: {tag}")

    page_times = []
    total_rois = 0

    for page_idx in range(num_pages):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=DPI)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        del pix

        print(f"  Page {page_idx + 1}/{num_pages}...", end=" ", flush=True)
        t0 = time.monotonic()
        try:
            detections = detect_layout(muna, image, tag)
            elapsed = time.monotonic() - t0
            page_times.append(elapsed)
            total_rois += len(detections)
            print(f"{elapsed:.2f}s ({len(detections)} ROIs)")
        except Exception as e:
            print(f"FAILED: {e}")
            page_times.append(0)

        del image

    doc.close()

    total_time = sum(page_times)
    avg_per_page = total_time / len(page_times) if page_times else 0

    return {
        "document": pdf_path.name,
        "num_pages": num_pages,
        "total_rois": total_rois,
        "total_time_s": round(total_time, 2),
        "avg_per_page_s": round(avg_per_page, 3),
        "page_times": [round(t, 3) for t in page_times]
    }

def main():
    print(f"Layout Detection Benchmark")
    print(f"Predictor: {PREDICTOR_TAG}")
    print(f"=" * 60)

    results = []
    total_start = time.monotonic()

    for pdf_path in sorted(DOCS_DIR.glob("*.pdf")):
        result = process_pdf(pdf_path, PREDICTOR_TAG)
        results.append(result)

    total_elapsed = time.monotonic() - total_start

    # Summary
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    total_pages = sum(r["num_pages"] for r in results)
    total_rois = sum(r["total_rois"] for r in results)
    total_time = sum(r["total_time_s"] for r in results)

    for r in results:
        print(f"{r['document']:30s} {r['num_pages']:2d} pages  "
              f"{r['total_time_s']:6.2f}s  ({r['avg_per_page_s']:.3f}s/page)")

    print(f"{'-' * 60}")
    print(f"{'TOTAL':30s} {total_pages:2d} pages  "
          f"{total_time:6.2f}s  ({total_time/total_pages:.3f}s/page)")
    print(f"Total ROIs detected: {total_rois}")
    print(f"Pipeline total: {total_elapsed:.2f}s")

    # Save to JSON
    output = {
        "predictor": PREDICTOR_TAG,
        "total_pages": total_pages,
        "total_rois": total_rois,
        "total_time_s": round(total_time, 2),
        "avg_per_page_s": round(total_time / total_pages, 3),
        "pipeline_total_s": round(total_elapsed, 2),
        "documents": results
    }

    output_file = f"/tmp/layout_benchmark_{PREDICTOR_TAG.replace('/', '_').replace('@', '')}.json"
    Path(output_file).write_text(json.dumps(output, indent=2))
    print(f"\nResults saved to: {output_file}")

if __name__ == "__main__":
    main()
