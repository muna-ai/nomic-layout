import type { Image } from "muna"
import { useEffect, useState } from "react"
import type { Page } from "@/hooks/use-pdf-reader"
import { parseLayout, recognizeTexts, captionImage, type LayoutItem } from "@/lib/inference"
import { extractTextFromRegion, cropImage, isValidText, type TextItem } from "@/lib/pdf"
import type { Element } from "@/lib/vector-store"
import { postToWorkerThread } from "@/lib/worker-proxy"

export interface UseLayoutParserInput {
  pages: Page[];
}

export interface UseLayoutParserReturn {
  elements: Element[];
  status: string | null;
}

export function useLayoutParser({ pages }: UseLayoutParserInput): UseLayoutParserReturn {
  // State to track layout elements
  const [elements, setElements] = useState<Element[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const hasPending = processedCount < pages.length;
  const status = hasPending ? (activeStatus ?? "Preparing...") : null;
  // Paese layout items
  useEffect(() => {
    if (!hasPending)
      return;
    let cancelled = false;
    (async () => {
      const pending = pages.slice(processedCount);
      for (let pi = 0; pi < pending.length; pi++) {
        if (cancelled)
          return;
        // Parse layout elements in page
        const page = pending[pi];
        setActiveStatus(`Analyzing page ${page.pageNumber} of ${page.documentName}...`);
        let detections;
        try {
          detections = await postToWorkerThread(parseLayout, { image: page.image });
        } catch (e) {
          console.warn(
            `Layout detection failed on page ${page.pageNumber} of ${page.documentName}:`,
            e
          );
          setProcessedCount((c) => c + 1);
          continue;
        }
        // Extract elements
        const pageElements: Element[] = [];
        for (let roiIdx = 0; roiIdx < detections.length; roiIdx++) {
          if (cancelled)
            return;
          const det = detections[roiIdx];
          if (det.confidence < LAYOUT_THRESHOLD)
            continue;
          const text = await extractText(det, roiIdx, page.image, page.textItems);
          if (!text)
            continue;
          pageElements.push({
            documentName: page.documentName,
            pageNumber: page.pageNumber,
            roiIndex: roiIdx,
            type: det.label,
            text: text.slice(0, MAX_TEXT_CHARS),
            xMin: det.x_min,
            yMin: det.y_min,
            xMax: det.x_max,
            yMax: det.y_max,
            confidence: det.confidence,
          });
        }
        if (cancelled)
          return;
        // Append
        setElements((prev) => [...prev, ...pageElements]);
        setProcessedCount((c) => c + 1);
      }
      setActiveStatus(null);
    })();
    return () => { cancelled = true; };
  }, [pages, hasPending, processedCount]);
  // Return
  return { elements, status };
}

async function extractText(
  det: LayoutItem,
  roiIdx: number,
  image: Image,
  textItems: TextItem[]
): Promise<string | undefined> {
  // Caption image
  if (det.label === "Picture") {
    try {
      const cropped = cropImage(image, det.x_min, det.y_min, det.x_max, det.y_max);
      return await postToWorkerThread(captionImage, { image: cropped });
    } catch (e) {
      console.warn(`Captioning failed for ROI ${roiIdx}:`, e);
      return undefined;
    }
  }
  // Try to extract text from PDF
  let text = extractTextFromRegion(textItems, det.x_min, det.y_min, det.x_max, det.y_max);
  if (text && isValidText(text))
    return text;
  // Run OCR
  try {
    const cropped = cropImage(image, det.x_min, det.y_min, det.x_max, det.y_max);
    const ocrResults = await postToWorkerThread(recognizeTexts, { image: cropped });
    if (ocrResults?.length)
      return ocrResults.map((r) => r.text).join(" ").trim();

  } catch (e) {
    console.warn(`OCR failed for ROI ${roiIdx}:`, e);
  }
}

const LAYOUT_THRESHOLD = 0.5;
const MAX_TEXT_CHARS = 2048;