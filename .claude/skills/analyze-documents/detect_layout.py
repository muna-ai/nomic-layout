"""
Phase 1: Layout detection + text extraction for PDF documents.

Usage: python detect_layout.py <pdf_path> <output_json_path>

Loads the nomic-layout-v1 model via Muna, detects ROIs on each page,
extracts text via PyMuPDF (with RapidOCR Muna predictor fallback),
and writes results to a JSON file.
"""

import json
import sys
from pathlib import Path

import pymupdf
from PIL import Image
from muna import Muna

DEFAULT_THRESHOLD = 0.5
DPI = 200
OCR_PAD_PX = 20  # Padding around ROI crops for better OCR accuracy


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


def _is_good_text(text: str) -> bool:
    """Check if extracted text looks like real text vs garbled OCR artifacts."""
    words = text.split()
    if not words:
        return False
    avg_word_len = sum(len(w) for w in words) / len(words)
    # Garbled text tends to have very long concatenated tokens
    if avg_word_len > 15:
        return False
    # Check ratio of alphabetic characters — garbled text often has lots of symbols
    alpha_chars = sum(1 for c in text if c.isalpha())
    if len(text) > 0 and alpha_chars / len(text) < 0.4:
        return False
    return True


def extract_text_from_roi(
    muna: Muna,
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
    if text and _is_good_text(text):
        return text

    # Fallback to RapidOCR via Muna
    try:
        w, h = image.size
        cropped = image.crop((
            max(0, int(x_min * w) - OCR_PAD_PX),
            max(0, int(y_min * h) - OCR_PAD_PX),
            min(w, int(x_max * w) + OCR_PAD_PX),
            min(h, int(y_max * h) + OCR_PAD_PX),
        ))
        prediction = muna.predictions.create(
            tag="@rapid-ai/rapid-ocr",
            inputs={"image": cropped},
        )
        if prediction.results and prediction.results[0]:
            ocr_results = prediction.results[0]
            text = " ".join(r["text"] for r in ocr_results).strip()
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
            text = extract_text_from_roi(muna, page, image, det)
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
