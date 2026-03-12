export interface ROIRecord {
  documentName: string;
  pageNumber: number;
  roiIndex: number;
  label: string;
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  confidence: number;
}

interface StoredRecord extends ROIRecord {
  vector: Float32Array;
}

export interface SearchResult extends ROIRecord {
  similarityScore: number;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function magnitude(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

export class VectorStore {
  private records: StoredRecord[] = [];

  add(records: ROIRecord[], vectors: number[][]): void {
    for (let i = 0; i < records.length; i++) {
      this.records.push({
        ...records[i],
        vector: new Float32Array(vectors[i]),
      });
    }
  }

  search(queryVector: number[], topK: number = 10): SearchResult[] {
    const qv = new Float32Array(queryVector);
    const scored = this.records.map(record => ({
      ...record,
      similarityScore: cosineSimilarity(qv, record.vector),
    }));
    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    return scored.slice(0, topK).map(({ vector: _, ...rest }) => ({
      ...rest,
      similarityScore: Math.round(rest.similarityScore * 10000) / 10000,
    }));
  }

  get size(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }
}
