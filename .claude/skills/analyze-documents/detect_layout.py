"""
Phase 1: Layout detection + text extraction for PDF documents.

Usage: python detect_layout.py <pdf_path> <output_json_path>

Loads the nomic-layout-v1 model via Muna, detects ROIs on each page,
extracts text via PyMuPDF (with RapidOCR fallback), and writes results
to a JSON file.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image
from muna import Muna

try:
    from rapidocr_onnxruntime import RapidOCR
    _ocr_engine = None
    _HAS_OCR = True
except ImportError:
    _HAS_OCR = False

DEFAULT_THRESHOLD = 0.5
DPI = 200


def detect_layout(muna: Muna, image: Image.Image) -> list[dict]:
    prediction = muna.predictions.create(
        tag="@nomic/nomic-layout-v1",
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


def extract_text_from_roi(
    page: "pymupdf.Page",
    image: Image.Image,
    detection: dict,
) -> str:
    x_min = detection["x_min"]
    y_min = detection["y_min"]
    x_max = detection["x_max"]
    y_max = detection["y_max"]

    # Try PyMuPDF first
    rect = pymupdf.Rect(
        x_min * page.rect.width,
        y_min * page.rect.height,
        x_max * page.rect.width,
        y_max * page.rect.height,
    )
    text = page.get_text("text", clip=rect).strip()
    if text:
        return text

    # Fallback to RapidOCR
    if _HAS_OCR:
        try:
            global _ocr_engine
            if _ocr_engine is None:
                _ocr_engine = RapidOCR()
            w, h = image.size
            cropped = image.crop((
                int(x_min * w), int(y_min * h),
                int(x_max * w), int(y_max * h),
            ))
            result, _ = _ocr_engine(np.array(cropped))
            if result:
                text = " ".join(line[1] for line in result).strip()
                if text:
                    return text
        except Exception as e:
            print(f"  [warn] RapidOCR failed: {e}", file=sys.stderr)

    return ""


def process_pdf(pdf_path: Path) -> tuple[list[dict], int]:
    muna = Muna()
    doc = pymupdf.open(str(pdf_path))
    num_pages = len(doc)
    records = []

    for page_idx in range(num_pages):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=DPI)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        del pix

        print(f"  Page {page_idx + 1}/{num_pages} — detecting layout...", file=sys.stderr)
        try:
            detections = detect_layout(muna, image)
        except Exception as e:
            print(f"  [warn] Layout detection failed on page {page_idx + 1}: {e}", file=sys.stderr)
            del image
            continue

        for roi_idx, det in enumerate(detections):
            text = extract_text_from_roi(page, image, det)
            if not text:
                continue
            records.append({
                "document_name": pdf_path.name,
                "page_number": page_idx + 1,
                "roi_index": roi_idx,
                "label": det.get("label", "Unknown"),
                "text": text,
                "x_min": float(det["x_min"]),
                "y_min": float(det["y_min"]),
                "x_max": float(det["x_max"]),
                "y_max": float(det["y_max"]),
                "confidence": float(det.get("confidence", 0.0)),
            })

        del image

    doc.close()
    return records, num_pages


if __name__ == "__main__":
    pdf_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    records, num_pages = process_pdf(pdf_path)
    output_path.write_text(json.dumps({
        "records": records,
        "num_pages": num_pages,
    }))
    print(f"  Extracted {len(records)} text regions from {num_pages} pages.", file=sys.stderr)
