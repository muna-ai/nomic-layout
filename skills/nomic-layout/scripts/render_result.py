#
#   Nomic Layout
#   Copyright © 2026 Nomic Inc. & NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "pymupdf", "typer"]
# ///

import json
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import pymupdf
from rich import print_json
from typer import Argument, Exit, Option, Typer
from typing import Annotated, Optional

DPI = 200
LABEL_COLORS = {
    "Title":            (255, 0, 0),
    "Text":             (0, 170, 0),
    "Section-header":   (0, 0, 255),
    "Table":            (255, 136, 0),
    "Picture":          (136, 0, 255),
    "List-item":        (0, 170, 170),
    "Key-Value Region": (170, 0, 170),
    "Page-header":      (136, 136, 136),
    "Page-footer":      (170, 170, 170),
}

app = Typer(add_completion=False)

@app.command()
def main(
    directory: Annotated[Path, Argument(
        help="Document directory containing the source PDFs",
        exists=True,
        file_okay=False,
        resolve_path=True,
    )],
    results: Annotated[Path, Option(
        "--results",
        help="JSON file with query results from query_index.py",
        exists=True,
        dir_okay=False,
        resolve_path=True,
    )],
    output_dir: Annotated[Path | None, Option(
        "--output-dir",
        "-o",
        help="Directory to write annotated images to (default: auto-generated temp dir)",
    )]=None,
) -> None:
    """
    Render annotated page images highlighting matched query results.

    Reads search results from --results, renders each matched page with
    highlighted ROI bounding boxes and annotation labels, and saves
    individual PNGs plus a combined annotated_results.pdf.

    Prints a JSON manifest of output files to stdout.
    """
    data = json.loads(results.read_text())
    result_list = data.get("results", data) if isinstance(data, dict) else data
    if not result_list:
        print_json(data={"annotated_pages": [], "combined_pdf": None})
        return
    out_dir = Path(output_dir) if output_dir else Path(tempfile.mkdtemp(prefix="nomic-layout-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    font, font_bold, font_small = _load_fonts()
    page_groups: dict[tuple[str, int], list[dict]] = {}
    for r in result_list:
        key = (r["document_name"], r["page_number"])
        page_groups.setdefault(key, []).append(r)
    sorted_pages = sorted(
        page_groups.items(),
        key=lambda item: max(r["similarity_score"] for r in item[1]),
        reverse=True,
    )
    annotated: list[dict] = []
    pdf_images: list[Image.Image] = []
    for (doc_name, page_num), rois in sorted_pages:
        doc_path = directory / doc_name
        if not doc_path.exists():
            print(f"Skipping {doc_name} (not found)", file=sys.stderr)
            continue
        try:
            doc = pymupdf.open(str(doc_path))
            page = doc[page_num - 1]
            pix = page.get_pixmap(dpi=DPI)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            doc.close()
        except Exception as e:
            print(f"Failed to render {doc_name} p.{page_num}: {e}", file=sys.stderr)
            continue
        _draw_annotations(img, rois, doc_name, page_num, font, font_bold, font_small)
        safe_name = doc_name.replace("/", "_").replace(" ", "_")
        out_path = out_dir / f"{safe_name}_page{page_num}.png"
        img.save(str(out_path))
        annotated.append({
            "document_name": doc_name,
            "page_number": page_num,
            "image_path": str(out_path),
        })
        pdf_images.append(img)
    combined_pdf: Optional[str] = None
    if pdf_images:
        pdf_path = out_dir / "annotated_results.pdf"
        pdf_images[0].save(
            str(pdf_path), "PDF",
            save_all=True,
            append_images=pdf_images[1:],
            resolution=150,
        )
        combined_pdf = str(pdf_path)
    print(f"Rendered {len(annotated)} annotated pages to {out_dir}", file=sys.stderr)
    print_json(data={
        "annotated_pages": annotated,
        "combined_pdf": combined_pdf,
    })

def _load_fonts() -> tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    """
    Load fonts for annotation rendering, falling back to defaults.
    """
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        font_bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    except (OSError, IOError):
        font = ImageFont.load_default()
        font_bold = font
        font_small = font
    return font, font_bold, font_small

def _draw_annotations(
    img: Image.Image,
    rois: list[dict],
    doc_name: str,
    page_num: int,
    font: ImageFont.FreeTypeFont,
    font_bold: ImageFont.FreeTypeFont,
    font_small: ImageFont.FreeTypeFont,
) -> None:
    """
    Draw ROI highlights, label tags, and source annotations onto a page image.
    """
    draw = ImageDraw.Draw(img)
    w, h = img.size
    for roi in rois:
        bb = roi["bounding_box"]
        color = LABEL_COLORS.get(roi["label"], (255, 255, 0))
        x0, y0 = int(bb["x_min"] * w), int(bb["y_min"] * h)
        x1, y1 = int(bb["x_max"] * w), int(bb["y_max"] * h)
        for offset in range(3):
            draw.rectangle((x0 - offset, y0 - offset, x1 + offset, y1 + offset), outline=color)
        label_text = f"{roi['label']} ({roi['similarity_score']:.2f})"
        text_bbox = draw.textbbox((x0, y0 - 18), label_text, font=font)
        draw.rectangle(text_bbox, fill=color)
        draw.text((x0, y0 - 18), label_text, fill=(255, 255, 255), font=font)
        short_name = doc_name.replace(".pdf", "")
        src_line = f"Source: {short_name}, p.{page_num}"
        score_line = f"Score: {roi['similarity_score']:.2f} | {roi['label']}"
        tw = draw.textbbox((0, 0), src_line, font=font_bold)[2] + 16
        sw = draw.textbbox((0, 0), score_line, font=font_small)[2] + 16
        th = draw.textbbox((0, 0), src_line, font=font_bold)[3]
        box_w = max(tw, sw)
        box_h = th + 22 + 8
        bx, by = x1 + 8, y0
        if bx + box_w > w:
            bx, by = x0, y1 + 8
        if by + box_h > h:
            by = y0 - box_h - 8
        draw.rectangle((bx + 2, by + 2, bx + box_w + 2, by + box_h + 2), fill=(100, 100, 100))
        draw.rectangle((bx, by, bx + box_w, by + box_h), fill=(255, 255, 220), outline=(180, 150, 50), width=2)
        draw.text((bx + 8, by + 4), src_line, fill=(50, 50, 50), font=font_bold)
        draw.text((bx + 8, by + 4 + th + 4), score_line, fill=(100, 100, 100), font=font_small)

if __name__ == "__main__":
    app()
