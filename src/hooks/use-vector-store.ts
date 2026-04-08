import { useCallback, useEffect, useRef, useState } from "react"
import { createEmbeddings } from "@/lib/ai"
import { VectorStore, type Element, type SearchResult } from "@/lib/vector-store"

export interface UseVectorStoreInput {
  elements: Element[];
}

export interface UseVectorStoreReturn {
  searchStore: (query: string, topK?: number) => Promise<SearchResult[]>;
  status: string | null;
  indexSize: number;
}

export function useVectorStore({ elements }: UseVectorStoreInput): UseVectorStoreReturn {
  // Vector store state
  const storeRef = useRef(new VectorStore());
  const processedCountRef = useRef(0);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const hasPending = processedCountRef.current < elements.length;
  const status = hasPending ? (activeStatus ?? "Preparing...") : null;
  // Embedding
  useEffect(() => {
    if (processedCountRef.current >= elements.length)
      return;
    let cancelled = false;
    (async () => {
      const pending = elements.slice(processedCountRef.current);
      const texts = pending.map((e) => e.text);
      const allVectors: number[][] = [];
      const numChunks = Math.ceil(texts.length / EMBEDDING_BATCH_SIZE);
      for (let i = 0; i < numChunks; i++) {
        if (cancelled)
          return;
        const start = i * EMBEDDING_BATCH_SIZE;
        const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
        setActiveStatus(`Embedding regions (${start + batch.length}/${texts.length})...`);
        const response = await createEmbeddings({
          texts: batch,
          task: "search_document",
        });
        for (const emb of response.data)
          allVectors.push(emb.embedding as number[]);
      }
      if (cancelled)
        return;
      storeRef.current.add(pending, allVectors);
      processedCountRef.current = elements.length;
      setActiveStatus(null);
    })();
    return () => { cancelled = true; };
  }, [elements]);
  // Search store handler
  const searchStore = useCallback(
    async (query: string, topK: number = DEFAULT_TOP_K): Promise<SearchResult[]> => {
      const response = await createEmbeddings({
        texts: [query],
        task: "search_query",
      });
      const queryVector = response.data[0].embedding as number[];
      return storeRef.current.search(queryVector, topK);
    },
    []
  );
  // Return
  return { searchStore, status, indexSize: storeRef.current.size };
}

const EMBEDDING_BATCH_SIZE = 4;
const DEFAULT_TOP_K = 10;