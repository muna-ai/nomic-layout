import {
  Muna,
  type Acceleration,
  type CreateEmbeddingResponse,
  type Image,
  type RemoteAcceleration
} from "muna"

const muna = new Muna({ accessKey: process.env.NEXT_PUBLIC_MUNA_ACCESS_KEY });
const openai = muna.beta.openai;

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
  label: string;
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
  acceleration?: Acceleration | RemoteAcceleration;
}

export interface ParseLayoutInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration | RemoteAcceleration;
}

export interface RecognizeTextInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration | RemoteAcceleration;
}

export interface CaptionImageInput {
  /**
   * Input image.
   */
  image: Image;
  /**
   * Prediction acceleration.
   */
  acceleration?: Acceleration | RemoteAcceleration;
}

export async function createEmbeddings({
  texts,
  task,
  acceleration = "local_auto"
}: CreateEmbeddingsInput): Promise<CreateEmbeddingResponse> {
  const input = task ? texts.map(t => `${task}: ${t}`) : texts;
  const embedding = await openai.embeddings.create({
    model: "@yusuf/nomic-embed-text-v1.5",
    input,
    acceleration: acceleration
  });
  return embedding;
}

export async function parseLayout({
  image,
  acceleration = "local_auto"
}: ParseLayoutInput): Promise<LayoutItem[]> {
  const opts = {
    tag: "@nomic/nomic-layout-v1",
    inputs: { image },
    acceleration: acceleration as any
  };
  const prediction = acceleration.startsWith("remote_") ?
    await muna.beta.predictions.remote.create(opts) :
    await muna.predictions.create(opts);
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as LayoutItem[];
}

export async function recognizeTexts({
  image,
  acceleration = "local_auto"
}: RecognizeTextInput): Promise<OcrResult[]> {
  const opts = {
    tag: "@rapid-ai/rapid-ocr",
    inputs: { image },
    acceleration: acceleration as any
  };
  const prediction = acceleration.startsWith("remote_") ?
    await muna.beta.predictions.remote.create(opts) :
    await muna.predictions.create(opts);
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as OcrResult[];
}

export async function captionImage({
  image,
  acceleration = "remote_a10" as RemoteAcceleration
}: CaptionImageInput): Promise<string> {
  const opts = {
    tag: "@salesforce/blip-image-captioning-base",
    inputs: { image },
    acceleration: acceleration as any
  };
  const prediction = acceleration.startsWith("remote_") ?
  await muna.beta.predictions.remote.create(opts) :
  await muna.predictions.create(opts);
  if (prediction.error)
    throw new Error(prediction.error);
  return prediction.results![0] as string;
}