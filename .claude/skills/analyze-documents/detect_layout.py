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
OCR_PAD_PX = 20  # Padding around ROI crops for better OCR accuracy

# Local compiled RapidOCR predictor paths
_PY2CPP_ROOT = Path("/home/anon/Work/fxn.ai/Code/src/current/py2cpp")
_LOCAL_OCR_DSO = _PY2CPP_ROOT / "build" / "libPredictor.so"
_LOCAL_OCR_TAG = "@fxn/test-graph"
_LOCAL_OCR_RESOURCES = [
    _PY2CPP_ROOT / "test/resources/0deeff4e3112ade803bbccecba8ef2f1aa31a21a2d89e6a54e709f18c8c88e8c",
    _PY2CPP_ROOT / "test/resources/d77fd19dcada50be61f2aea649a810774dafb8e03f8604183c8011d310f764f8",
    _PY2CPP_ROOT / "test/resources/0df447e0b71160aa8abe8cd2ebf3918d1d2ba9dee128230543833d4b21bf99cd",
    _PY2CPP_ROOT / "test/resources/d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9",
    _PY2CPP_ROOT / "test/resources/a7f4abc2fc3fb6911420a8eff975a5f1c8b73e258c36b27be85550aaa2f43290",
    _PY2CPP_ROOT / "test/resources/e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c",
    _PY2CPP_ROOT / "test/resources/8ef3546e7302efe19de6274240167c38ff44f9218d7baad31ad0b171747071f5",
    _PY2CPP_ROOT / "test/resources/48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b",
]


def _load_local_ocr_predictor(muna: Muna):
    """Load the locally compiled RapidOCR predictor into the Muna cache."""
    cache = muna.predictions._PredictionService__cache
    if _LOCAL_OCR_TAG in cache:
        return
    from muna.c import Configuration, Predictor
    with Configuration() as configuration:
        configuration.tag = _LOCAL_OCR_TAG
        configuration.add_resource("dso", _LOCAL_OCR_DSO.resolve())
        for res_path in _LOCAL_OCR_RESOURCES:
            configuration.add_resource("bin", res_path.resolve())
        predictor = Predictor(configuration)
    cache[_LOCAL_OCR_TAG] = predictor


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

    # Fallback to RapidOCR via rapidocr_onnxruntime (standalone Python)
    if _HAS_OCR:
        try:
            global _ocr_engine
            if _ocr_engine is None:
                _ocr_engine = RapidOCR()
            w, h = image.size
            cropped = image.crop((
                max(0, int(x_min * w) - OCR_PAD_PX),
                max(0, int(y_min * h) - OCR_PAD_PX),
                min(w, int(x_max * w) + OCR_PAD_PX),
                min(h, int(y_max * h) + OCR_PAD_PX),
            ))
            result, _ = _ocr_engine(np.array(cropped))
            if result:
                text = " ".join(line[1] for line in result).strip()
                if text:
                    return text
        except Exception as e:
            print(f"  [warn] RapidOCR failed: {e}", file=sys.stderr)

    # # Fallback to RapidOCR via locally compiled Muna predictor
    # try:
    #     _load_local_ocr_predictor(muna)
    #     w, h = image.size
    #     cropped = image.crop((
    #         max(0, int(x_min * w) - OCR_PAD_PX),
    #         max(0, int(y_min * h) - OCR_PAD_PX),
    #         min(w, int(x_max * w) + OCR_PAD_PX),
    #         min(h, int(y_max * h) + OCR_PAD_PX),
    #     ))
    #     prediction = muna.predictions.create(
    #         tag=_LOCAL_OCR_TAG,
    #         inputs={"image": cropped},
    #     )
    #     if prediction.results and prediction.results[0]:
    #         ocr_results = prediction.results[0]
    #         text = " ".join(r["text"] for r in ocr_results).strip()
    #         if text:
    #             return text
    # except Exception as e:
    #     print(f"  [warn] RapidOCR failed: {e}", file=sys.stderr)

    # # Fallback to RapidOCR via Muna (cloud)
    # try:
    #     w, h = image.size
    #     cropped = image.crop((
    #         max(0, int(x_min * w) - OCR_PAD_PX),
    #         max(0, int(y_min * h) - OCR_PAD_PX),
    #         min(w, int(x_max * w) + OCR_PAD_PX),
    #         min(h, int(y_max * h) + OCR_PAD_PX),
    #     ))
    #     prediction = muna.predictions.create(
    #         tag="@rapid-ai/rapid-ocr",
    #         inputs={"image": cropped},
    #     )
    #     if prediction.results and prediction.results[0]:
    #         ocr_results = prediction.results[0]
    #         text = " ".join(r["text"] for r in ocr_results).strip()
    #         if text:
    #             return text
    # except Exception as e:
    #     print(f"  [warn] RapidOCR failed: {e}", file=sys.stderr)

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
