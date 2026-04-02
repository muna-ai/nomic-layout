#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["typer", "muna", "pymupdf", "python-dotenv"]
# ///

from dotenv import load_dotenv
import platform
import sys
import time
from muna import Muna
from pathlib import Path
from PIL import Image
import pymupdf
from pydantic import BaseModel, Field, TypeAdapter
from typing import Annotated
from rich import print_json
from typer import Argument, Exit, Option, Typer

class Detection(BaseModel):
    """
    Detected element from Nomic Layout v1.
    See output schema: https://www.muna.ai/@nomic/nomic-layout-v1.
    """
    x_min: float = Field(description="Normalized minimum X coordinate.")
    y_min: float = Field(description="Normalized minimum Y coordinate.")
    x_max: float = Field(description="Normalized maximum X coordinate.")
    y_max: float = Field(description="Normalized maximum Y coordinate.")
    label: str = Field(description="Layout element label.")
    confidence: float = Field(description="Detection confidence score.")

class ROIRecord(BaseModel):
    """
    A single region-of-interest record extracted from a PDF page.
    """
    document_name: str = Field(description="Source PDF filename.")
    page_number: int = Field(description="1-based page number.")
    roi_index: int = Field(description="0-based index of the ROI on the page.")
    label: str = Field(description="Layout element label.")
    text: str = Field(description="Extracted text content.")
    x_min: float = Field(description="Normalized minimum X coordinate.")
    y_min: float = Field(description="Normalized minimum Y coordinate.")
    x_max: float = Field(description="Normalized maximum X coordinate.")
    y_max: float = Field(description="Normalized maximum Y coordinate.")
    confidence: float = Field(description="Detection confidence score.")

DEFAULT_THRESHOLD = 0.5
DPI = 200
OCR_PAD_PX = 20
CAPTION_LABELS = { "Picture" }
LAYOUT_MODEL_TAG = (
    "@nomic/nomic-layout-v1-mlx"
    if platform.system() == "Darwin" and platform.machine() == "arm64"
    else "@nomic/nomic-layout-v1"
)

app = Typer(add_completion=False)

@app.command()
def main(
    pdf_path: Annotated[Path, Argument(
        help="Path to the PDF document to process",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    blip_remote: Annotated[bool, Option(
        "--blip-remote",
        help="Run BLIP image captioning on a remote A100 GPU",
    )]=False,
    threshold: Annotated[float, Option(
        "--threshold",
        help="Detection confidence threshold for all ROI types",
    )]=DEFAULT_THRESHOLD,
) -> None:
    """
    Run layout detection and text extraction on a single PDF.

    Detects layout regions (text, tables, headers, pictures, etc.) on every
    page using nomic-layout-v1, extracts text via PyMuPDF with RapidOCR
    fallback, and optionally captions picture regions with BLIP.

    Prints JSON to stdout with records, page count, and timing stats.
    """
    # Create Muna client
    load_dotenv(".env")
    load_dotenv(".env.local")
    muna = Muna()
    # Parse PDF
    doc = pymupdf.open(str(pdf_path))
    num_pages = len(doc)
    records: list[ROIRecord] = []
    t_start = time.monotonic()
    layout_times: list[float] = []
    ocr_times: list[float] = []
    blip_times: list[float] = []
    total_rois = 0
    ocr_calls = 0
    blip_calls = 0
    print(f"  Using predictor: {LAYOUT_MODEL_TAG}", file=sys.stderr)
    for page_idx in range(num_pages):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=DPI)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        del pix
        print(f"  Page {page_idx + 1}/{num_pages} — detecting layout...", file=sys.stderr)
        t0 = time.monotonic()
        try:
            detections = _detect_layout(image, muna=muna, threshold=threshold)
        except Exception as e:
            print(f"  Layout detection failed on page {page_idx + 1}: {e}", file=sys.stderr)
            raise Exit(code=1)
        layout_times.append(time.monotonic() - t0)
        total_rois += len(detections)
        for roi_idx, det in enumerate(detections):
            t0 = time.monotonic()
            text = _extract_text_from_roi(det, image, page, muna)
            ocr_elapsed = time.monotonic() - t0
            if ocr_elapsed > 0.01:
                ocr_times.append(ocr_elapsed)
                ocr_calls += 1
            if det.label in CAPTION_LABELS:
                t0 = time.monotonic()
                caption = _caption_image_roi(det, image=image, muna=muna, blip_remote=blip_remote)
                blip_times.append(time.monotonic() - t0)
                blip_calls += 1
                if caption:
                    text = f"{text} [image: {caption}]" if text else f"[image: {caption}]"
            if not text:
                continue
            records.append(ROIRecord(
                document_name=pdf_path.name,
                page_number=page_idx + 1,
                roi_index=roi_idx,
                label=det.label,
                text=text,
                x_min=det.x_min,
                y_min=det.y_min,
                x_max=det.x_max,
                y_max=det.y_max,
                confidence=det.confidence,
            ))
        del image
    doc.close()
    total_elapsed = time.monotonic() - t_start
    print(f"  Extracted {len(records)} text regions from {num_pages} pages.", file=sys.stderr)
    print_json(data={
        "records": [r.model_dump() for r in records],
        "num_pages": num_pages,
        "timing": {
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
        },
    })

def _detect_layout(
    image: Image.Image,
    *,
    muna: Muna,
    threshold: float=DEFAULT_THRESHOLD
) -> list[Detection]:
    """
    Run nomic-layout-v1 on a page image and return detected regions.
    """
    prediction = muna.predictions.create(
        tag=LAYOUT_MODEL_TAG,
        inputs={
            "image": image,
            "picture_threshold": threshold,
            "footer_threshold": threshold,
            "header_threshold": threshold,
            "key_value_threshold": threshold,
            "list_item_threshold": threshold,
            "section_header_threshold": threshold,
            "table_threshold": threshold,
            "text_threshold": threshold,
            "title_threshold": threshold,
        },
    )
    parser = TypeAdapter(list[Detection])
    return parser.validate_python(prediction.results[0])

def _extract_text_from_roi(
    detection: Detection,
    image: Image.Image,
    page: pymupdf.Page,
    muna: Muna
) -> str:
    """
    Extract text from a single ROI, trying PyMuPDF first then RapidOCR fallback.
    """
    x_min = detection.x_min
    y_min = detection.y_min
    x_max = detection.x_max
    y_max = detection.y_max
    rect = pymupdf.Rect(
        x_min * page.rect.width,
        y_min * page.rect.height,
        x_max * page.rect.width,
        y_max * page.rect.height,
    )
    text = page.get_text("text", clip=rect).strip()
    if text and _is_good_text(text):
        return text
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

def _caption_image_roi(
    detection: Detection,
    *,
    image: Image.Image,
    muna: Muna,
    blip_remote: bool=False
) -> str:
    """
    Generate a text caption for an image ROI using BLIP.
    """
    w, h = image.size
    cropped = image.crop((
        max(0, int(detection.x_min * w)),
        max(0, int(detection.y_min * h)),
        min(w, int(detection.x_max * w)),
        min(h, int(detection.y_max * h)),
    ))
    try:
        if blip_remote:
            prediction = muna.beta.predictions.remote.create(
                tag="@salesforce/blip-image-captioning-base",
                inputs={ "image": cropped },
                acceleration="remote_a100",
            )
        else:
            prediction = muna.predictions.create(
                tag="@salesforce/blip-image-captioning-base",
                inputs={ "image": cropped },
            )
        if prediction.results and prediction.results[0]:
            return prediction.results[0]
    except Exception as e:
        print(f"  [warn] BLIP captioning failed: {e}", file=sys.stderr)
    return ""

def _is_good_text(text: str) -> bool:
    """
    Check if extracted text looks like real text vs garbled OCR artifacts.
    """
    words = text.split()
    if not words:
        return False
    avg_word_len = sum(len(w) for w in words) / len(words)
    if avg_word_len > 15:
        return False
    alpha_chars = sum(1 for c in text if c.isalpha())
    if len(text) > 0 and alpha_chars / len(text) < 0.4:
        return False
    return True

if __name__ == "__main__":
    app()
