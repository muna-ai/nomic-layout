import { Muna } from "muna"
import type { Acceleration, CreateEmbeddingResponse, Image } from "muna"

const origin = typeof self !== "undefined" ? self.location.origin : "";
const muna = new Muna({ url: `${origin}/api/muna` });

export type LayoutItemLabel = 
  "Picture"           | 
  "Page-footer"       |
  "Page-header"       |
  "Key-Value Region"  |
  "List-item"         |
  "Section-header"    |
  "Table"             |
  "Text"              |
  "Title";

export interface LayoutItem {
  /**
   * Normalized minimum X coordinate.
   */
  x_min: number;
  /**
   * Normalized minimum Y coordinate.
   */
  y_min: number;
  /**
   * Normalized maximum X coordinate.
   */
  x_max: number;
  /**
   * Normalized maximum Y coordinate."
   */
  y_max: number;
  /**
   * Layout element label.
   */
  label: LayoutItemLabel;
  /**
   * Detection confidence score.
   */
  confidence: number;
}

export interface OcrResult {
  /**
   * Recognized text.
   */
  text: string;
  /**
   * Recognition confidence score.
   */
  confidence: number;
  /**
   * Normalized bounding box as (x,y,w,h).
   */
  box: number[];
}

export interface CreateEmbeddingsInput {
  /**
   * Input texts.
   */
  texts: string[];
  /**
   * Embedding task prefix for Nomic embed v1.5.
   */
  task?: "search_document" | "search_query";
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration;
}

export interface ParseLayoutInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration;
}

export interface RecognizeTextInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration;
}

export interface CaptionImageInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration;
}

export async function preloadModels(
  onProgress?: (model: string, status: "loading" | "ready") => void
): Promise<void> {
  onProgress?.("layout", "loading");
  try { await parseLayout({ } as any); } catch (err) { }
  onProgress?.("layout", "ready");
  onProgress?.("embeddings", "loading");
  try { await createEmbeddings({ } as any); } catch (err) { }
  onProgress?.("embeddings", "ready");
  onProgress?.("ocr", "loading");
  try { await recognizeTexts({ } as any); } catch (err) { }
  onProgress?.("ocr", "ready");
}

export async function createEmbeddings({
  texts,
  task,
  acceleration = "local_auto"
}: CreateEmbeddingsInput): Promise<CreateEmbeddingResponse> {
  const openai = muna.beta.openai;
  const input = task ? texts.map(t => `${task}: ${t}`) : texts;
  const embedding = await openai.embeddings.create({
    model: "@nomic/nomic-embed-text-v1.5-quant",
    input,
    acceleration: acceleration
  });
  return embedding;
}

export async function parseLayout({
  image,
  acceleration = "local_auto"
}: ParseLayoutInput): Promise<LayoutItem[]> {
  const prediction = await muna.predictions.create({
    tag: "@nomic/nomic-layout-v1",
    inputs: { image },
    acceleration
  });
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as LayoutItem[];
}

export async function recognizeTexts({
  image,
  acceleration = "local_auto"
}: RecognizeTextInput): Promise<OcrResult[]> {
  const prediction = await muna.predictions.create({
    tag: "@rapid-ai/rapid-ocr",
    inputs: { image },
    acceleration
  });
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as OcrResult[];
}

export async function captionImage({
  image,
  acceleration = "remote_a10"
}: CaptionImageInput): Promise<string> {
  const prediction = await muna.predictions.create({
    tag: "@salesforce/blip-image-captioning-base",
    inputs: { image },
    acceleration: acceleration
  });
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as string;
}