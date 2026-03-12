import { loadPdf, extractTextFromRegion, cropImage, isGoodText } from "./pdf";
import { createEmbeddings, parseLayout, recognizeTexts } from "./inference";
import { VectorStore, type ROIRecord, type SearchResult } from "./vector-store";

const EMBEDDING_BATCH_SIZE = 10;
const MAX_TEXT_CHARS = 2048;
const DEFAULT_TOP_K = 10;
const LAYOUT_THRESHOLD = 0.5;

export interface IndexResult {
  totalPages: number;
  totalROIs: number;
}

export interface PipelineResult {
  query: string;
  results: SearchResult[];
  totalROIs: number;
  totalPages: number;
}

export async function indexDocuments(
  store: VectorStore,
  files: File[],
  onProgress?: (status: string) => void
): Promise<IndexResult> {
  const allRecords: ROIRecord[] = [];
  let totalPages = 0;

  for (const file of files) {
    const pages = await loadPdf(file, (pageNum, pageTotal) => {
      onProgress?.(`Loading ${file.name} (page ${pageNum}/${pageTotal})...`);
    });
    totalPages += pages.length;

    for (const page of pages) {
      onProgress?.(
        `Analyzing page ${page.pageNumber}/${pages.length} of ${file.name}...`
      );

      let detections;
      try {
        detections = await parseLayout({ image: page.image });
      } catch (e) {
        console.warn(
          `Layout detection failed on page ${page.pageNumber} of ${file.name}:`,
          e
        );
        continue;
      }

      for (let roiIdx = 0; roiIdx < detections.length; roiIdx++) {
        const det = detections[roiIdx];
        if (det.confidence < LAYOUT_THRESHOLD) continue;

        let text = extractTextFromRegion(
          page.textItems,
          det.x_min,
          det.y_min,
          det.x_max,
          det.y_max
        );

        if (!text || !isGoodText(text)) {
          try {
            const cropped = cropImage(
              page.image,
              det.x_min,
              det.y_min,
              det.x_max,
              det.y_max
            );
            const ocrResults = await recognizeTexts({ image: cropped });
            if (ocrResults?.length) {
              text = ocrResults.map((r) => r.text).join(" ").trim();
            }
          } catch (e) {
            console.warn(`OCR failed for ROI ${roiIdx}:`, e);
          }
        }

        if (!text) continue;

        allRecords.push({
          documentName: file.name,
          pageNumber: page.pageNumber,
          roiIndex: roiIdx,
          label: det.label,
          text: text.slice(0, MAX_TEXT_CHARS),
          xMin: det.x_min,
          yMin: det.y_min,
          xMax: det.x_max,
          yMax: det.y_max,
          confidence: det.confidence,
        });

        await (globalThis as any).scheduler?.yield();
      }
    }
  }

  if (allRecords.length === 0) {
    return { totalPages, totalROIs: 0 };
  }

  const texts = allRecords.map((r) => r.text);
  const allVectors: number[][] = [];
  const numChunks = Math.ceil(texts.length / EMBEDDING_BATCH_SIZE);

  for (let i = 0; i < numChunks; i++) {
    const start = i * EMBEDDING_BATCH_SIZE;
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    onProgress?.(
      `Embedding text regions (${start + batch.length}/${texts.length})...`
    );
    const response = await createEmbeddings({
      texts: batch,
      task: "search_document",
    });
    for (const emb of response.data) {
      allVectors.push(emb.embedding as number[]);
    }
    await (globalThis as any).scheduler?.yield();
  }

  store.add(allRecords, allVectors);

  return { totalPages, totalROIs: allRecords.length };
}

export async function searchDocuments(
  store: VectorStore,
  query: string,
  onProgress?: (status: string) => void,
  topK: number = DEFAULT_TOP_K
): Promise<SearchResult[]> {
  onProgress?.("Searching...");
  const queryResponse = await createEmbeddings({
    texts: [query],
    task: "search_query",
  });
  const queryVector = queryResponse.data[0].embedding as number[];
  return store.search(queryVector, topK);
}
