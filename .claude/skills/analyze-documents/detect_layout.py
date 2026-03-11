"""
Phase 1: Layout detection + text extraction for PDF documents.

Usage: python detect_layout.py <pdf_path> <output_json_path>

Loads the nomic-layout-v1 model via Muna, detects ROIs on each page,
extracts text via PyMuPDF (with RapidOCR Muna predictor fallback),
and writes results to a JSON file.
"""

import json
import platform
import sys
import time
from pathlib import Path

import pymupdf
from PIL import Image
from muna import Muna

DEFAULT_THRESHOLD = 0.5
DPI = 200
OCR_PAD_PX = 20  # Padding around ROI crops for better OCR accuracy
CAPTION_LABELS = {"Picture"}  # ROI labels eligible for BLIP captioning

# Detect if running on Apple Silicon
def _is_apple_silicon() -> bool:
    """Check if running on Apple Silicon (ARM64 Mac)."""
    return platform.system() == "Darwin" and platform.machine() == "arm64"

# Select the appropriate predictor tag
LAYOUT_PREDICTOR_TAG = "@nomic/nomic-layout-v1-mlx" if _is_apple_silicon() else "@nomic/nomic-layout-v1"


def detect_layout(muna: Muna, image: Image.Image) -> list[dict]:
    prediction = muna.predictions.create(
        tag=LAYOUT_PREDICTOR_TAG,
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


def caption_image_roi(
    muna: Muna,
    image: Image.Image,
    detection: dict,
) -> str:
    """Generate a text caption for an image ROI using BLIP."""
    w, h = image.size
    x_min = detection["x_min"]
    y_min = detection["y_min"]
    x_max = detection["x_max"]
    y_max = detection["y_max"]
    cropped = image.crop((
        max(0, int(x_min * w)),
        max(0, int(y_min * h)),
        min(w, int(x_max * w)),
        min(h, int(y_max * h)),
    ))
    try:
        prediction = muna.predictions.create(
            tag="@salesforce/blip-image-captioning-base",
            inputs={"image": cropped},
        )
        if prediction.results and prediction.results[0]:
            return prediction.results[0]
    except Exception as e:
        print(f"  [warn] BLIP captioning failed: {e}", file=sys.stderr)
    return ""


def process_pdf(pdf_path: Path) -> tuple[list[dict], int, dict]:
    muna = Muna()
    doc = pymupdf.open(str(pdf_path))
    num_pages = len(doc)
    records = []
    # Timing stats
    t_start = time.monotonic()
    layout_times = []
    ocr_times = []
    blip_times = []
    total_rois = 0
    ocr_calls = 0
    blip_calls = 0

    print(f"  Using predictor: {LAYOUT_PREDICTOR_TAG}", file=sys.stderr)

    for page_idx in range(num_pages):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=DPI)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        del pix

        print(f"  Page {page_idx + 1}/{num_pages} — detecting layout...", file=sys.stderr)
        t0 = time.monotonic()
        try:
            detections = detect_layout(muna, image)
        except Exception as e:
            print(f"  [warn] Layout detection failed on page {page_idx + 1}: {e}", file=sys.stderr)
            del image
            continue
        layout_times.append(time.monotonic() - t0)
        total_rois += len(detections)

        for roi_idx, det in enumerate(detections):
            label = det.get("label", "Unknown")
            t0 = time.monotonic()
            text = extract_text_from_roi(muna, page, image, det)
            ocr_elapsed = time.monotonic() - t0
            if ocr_elapsed > 0.01:  # only count actual OCR calls, not fast PyMuPDF hits
                ocr_times.append(ocr_elapsed)
                ocr_calls += 1
            # For Picture ROIs, always run BLIP captioning and merge with OCR text
            if label in CAPTION_LABELS:
                t0 = time.monotonic()
                caption = caption_image_roi(muna, image, det)
                blip_times.append(time.monotonic() - t0)
                blip_calls += 1
                if caption:
                    if text:
                        text = f"{text} [image: {caption}]"
                    else:
                        text = f"[image: {caption}]"
            if not text:
                continue
            records.append({
                "document_name": pdf_path.name,
                "page_number": page_idx + 1,
                "roi_index": roi_idx,
                "label": label,
                "text": text,
                "x_min": float(det["x_min"]),
                "y_min": float(det["y_min"]),
                "x_max": float(det["x_max"]),
                "y_max": float(det["y_max"]),
                "confidence": float(det.get("confidence", 0.0)),
            })

        del image

    doc.close()
    total_elapsed = time.monotonic() - t_start
    timing = {
        "total_s": round(total_elapsed, 2),
        "num_pages": num_pages,
        "total_rois_detected": total_rois,
        "layout_total_s": round(sum(layout_times), 2),
        "layout_avg_per_page_s": round(sum(layout_times) / len(layout_times), 3) if layout_times else 0,
        "ocr_calls": ocr_calls,
        "ocr_total_s": round(sum(ocr_times), 2),
        "ocr_avg_per_roi_s": round(sum(ocr_times) / len(ocr_times), 3) if ocr_times else 0,
        "blip_calls": blip_calls,
        "blip_total_s": round(sum(blip_times), 2),
        "blip_avg_per_roi_s": round(sum(blip_times) / len(blip_times), 3) if blip_times else 0,
    }
    return records, num_pages, timing


if __name__ == "__main__":
    pdf_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    records, num_pages, timing = process_pdf(pdf_path)
    output_path.write_text(json.dumps({
        "records": records,
        "num_pages": num_pages,
        "timing": timing,
    }))
    print(f"  Extracted {len(records)} text regions from {num_pages} pages.", file=sys.stderr)
