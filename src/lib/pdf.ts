import type { Image } from "muna"

export interface PageData {
  pageNumber: number;
  image: Image;
  textItems: TextItem[];
}

export interface TextItem {
  str: string;
  /** Normalized coordinates [0, 1] */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderPdfPageResult {
  cancel: () => void;
  promise: Promise<void>;
}

/**
 * Load a PDF file and render each page as a Muna Image with extracted text positions.
 * Optionally report progress as each page is loaded (pageIndex 1-based, total page count).
 */
export async function loadPdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PageData[]> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: PageData[] = [];
  const total = doc.numPages;

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({
      canvas: canvas as any,
      canvasContext: ctx as any,
      viewport
    }).promise;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const image: Image = {
      data: imageData.data,
      width: canvas.width,
      height: canvas.height,
      channels: 4,
    };
    const textContent = await page.getTextContent();
    const textItems: TextItem[] = [];
    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim())
        continue;
      const tx = item.transform[4];
      const ty = item.transform[5];
      const w = item.width;
      const h = item.height;
      textItems.push({
        str: item.str,
        x: tx / viewport.width * RENDER_SCALE,
        y: 1 - (ty + h) / viewport.height * RENDER_SCALE,
        width: w / viewport.width * RENDER_SCALE,
        height: h / viewport.height * RENDER_SCALE,
      });
    }
    pages.push({ pageNumber: i, image, textItems });
    page.cleanup();
  }
  doc.destroy();
  return pages;
}

/**
 * Render a single PDF page to an HTML canvas (e.g. for the preview panel).
 * The canvas width/height are set to the page viewport; the parent can scale with CSS.
 * Fills the canvas with white before drawing so the page has an opaque background.
 * Returns { cancel, promise } so the caller can cancel an in-flight render (e.g. when selection changes).
 */
export function renderPdfPage(
  file: File,
  pageNumber: number,
  canvas: HTMLCanvasElement
): RenderPdfPageResult {
  let renderTask: { cancel: () => void } | null = null;

  const promise = (async () => {
    const pdfjsLib = await getPdfjs();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PREVIEW_SCALE });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({ canvas, canvasContext: ctx, viewport });
    renderTask = task;
    await task.promise;
    page.cleanup();
    doc.destroy();
  })();

  return {
    cancel: () => {
      if (renderTask && typeof (renderTask as any).cancel === "function") {
        (renderTask as any).cancel();
      }
    },
    promise,
  };
}

/**
 * Extract text from a region of interest using pre-extracted pdfjs text items.
 * Matches text items whose centers fall within the ROI bounding box.
 */
export function extractTextFromRegion(
  textItems: TextItem[],
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): string {
  const matches: { str: string; y: number; x: number }[] = [];
  for (const item of textItems) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) {
      matches.push({ str: item.str, y: item.y, x: item.x });
    }
  }
  matches.sort((a, b) => a.y - b.y || a.x - b.x);
  return matches.map(m => m.str).join(" ").trim();
}

/**
 * Crop an image region for OCR fallback.
 * Takes normalized coordinates and returns a new Muna Image.
 */
export function cropImage(
  image: Image,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): Image {
  const pad = OCR_PAD_FRACTION;
  const x0 = Math.max(0, Math.floor((xMin - pad) * image.width));
  const y0 = Math.max(0, Math.floor((yMin - pad) * image.height));
  const x1 = Math.min(image.width, Math.ceil((xMax + pad) * image.width));
  const y1 = Math.min(image.height, Math.ceil((yMax + pad) * image.height));
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  const data = new Uint8ClampedArray(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcOffset = ((y0 + row) * image.width + x0) * 4;
    const dstOffset = row * cropW * 4;
    data.set(image.data.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
  }
  return { data, width: cropW, height: cropH, channels: 4 };
}

/**
 * Check if text looks like real content vs garbled artifacts.
 */
export function isValidText(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0)
    return false;
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgLen > 15)
    return false;
  const alpha = [...text].filter(c => /[a-zA-Z]/.test(c)).length;
  if (text.length > 0 && alpha / text.length < 0.4)
    return false;
  return true;
}

async function getPdfjs() {
  if (pdfjsLoaded)
    return pdfjsLoaded;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  pdfjsLoaded = pdfjs;
  return pdfjs;
}

const RENDER_SCALE = 2.5;
const OCR_PAD_FRACTION = 0.02;
const PREVIEW_SCALE = 2;

let pdfjsLoaded: typeof import("pdfjs-dist") | null = null;