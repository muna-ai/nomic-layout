import { useCallback, useRef, useState } from "react"
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"
import { indexDocuments, searchDocuments, type PipelineResult } from "@/lib/pipeline"
import { VectorStore, type SearchResult } from "@/lib/vector-store"

export interface ChatEntry {
  id: string;
  query: string;
  fileNames?: string[];
  result?: PipelineResult;
  status?: string;
}

export function useDocumentSearch() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<Map<string, File>>(new Map());
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [indexedFileNames, setIndexedFileNames] = useState<string[]>([]);
  const entryIdRef = useRef(0);
  const storeRef = useRef<VectorStore>(new VectorStore());

  const handleSelectResult = useCallback((r: SearchResult) => {
    setSelectedResult((prev) =>
      prev !== null &&
      prev.documentName === r.documentName &&
      prev.pageNumber === r.pageNumber &&
      prev.roiIndex === r.roiIndex
        ? null
        : r
    );
  }, []);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const query = message.text?.trim();
      if (!query) return;

      const hasFiles = !!message.files?.length;
      const hasIndex = storeRef.current.size > 0;
      if (!hasFiles && !hasIndex) return;

      setIsProcessing(true);
      const id = String(++entryIdRef.current);
      const fileNames = hasFiles
        ? message.files!.map((f) => f.filename ?? "document.pdf")
        : undefined;

      setEntries((prev) => [
        ...prev,
        { id, query, fileNames, status: "Starting..." },
      ]);

      const updateStatus = (status: string) => {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status } : e))
        );
      };

      try {
        const store = storeRef.current;

        if (hasFiles) {
          const files: File[] = [];
          for (const filePart of message.files!) {
            if (!filePart.url) continue;
            const resp = await fetch(filePart.url);
            const blob = await resp.blob();
            const file = new File([blob], filePart.filename ?? "document.pdf", { type: "application/pdf" });
            files.push(file);
          }
          setPdfFiles((prev) => {
            const next = new Map(prev);
            for (const f of files) next.set(f.name, f);
            return next;
          });

          await indexDocuments(store, files, updateStatus);
          setIndexedFileNames((prev) => {
            const names = new Set(prev);
            for (const f of files) names.add(f.name);
            return Array.from(names);
          });
        }

        const results = await searchDocuments(store, query, updateStatus);

        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  result: {
                    query,
                    results,
                    totalROIs: store.size,
                    totalPages: 0,
                  },
                  status: undefined,
                }
              : e
          )
        );
      } catch (err) {
        console.error("Pipeline failed:", err);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: undefined,
                  result: {
                    query,
                    results: [],
                    totalROIs: 0,
                    totalPages: 0,
                  },
                }
              : e
          )
        );
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  return {
    entries,
    isProcessing,
    pdfFiles,
    selectedResult,
    indexedFileNames,
    handleSelectResult,
    handleSubmit,
    setSelectedResult,
  };
}
