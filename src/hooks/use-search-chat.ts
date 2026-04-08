"use client"

import { useCallback, useEffect, useRef, useState, startTransition } from "react"
import { generateSummary } from "@/lib/ai"
import type { SearchResult } from "@/lib/vector-store"
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"

export type PipelinePhase = "load-pdf" | "parse-layout" | "embed" | "search" | "summarize";

export interface ChatEntry {
  id: string;
  query: string;
  fileNames?: string[];
  results?: SearchResult[];
  llmResponse?: string;
  status?: string;
  phase?: PipelinePhase;
}

export interface UseSearchChatInput {
  pdfStatus: string | null;
  parseStatus: string | null;
  indexStatus: string | null;
  searchStore: (query: string) => Promise<SearchResult[]>;
  indexSize: number;
  addDocuments: (files: File[]) => void;
}

export interface UseSearchChatResult {
  entries: ChatEntry[];
  result: SearchResult | null;
  showResultPreview: (result: SearchResult | null) => void;
  submit: (message: PromptInputMessage) => Promise<void>;
  isProcessing: boolean;
}

export function useSearchChat({
  pdfStatus,
  parseStatus,
  indexStatus,
  indexSize,
  searchStore,
  addDocuments,
}: UseSearchChatInput): UseSearchChatResult {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const pendingEntryIdRef = useRef<string | null>(null);
  const entryIdRef = useRef(0);

  const pipelineIdle = !pdfStatus && !parseStatus && !indexStatus;
  const pipelineStatus = pdfStatus ?? parseStatus ?? indexStatus;
  const isProcessing = !!pendingQuery || isSearching;

  useEffect(() => {
    if (!pendingEntryIdRef.current || !pipelineStatus) return;
    const id = pendingEntryIdRef.current;
    const phase: PipelinePhase | undefined =
      pdfStatus ? "load-pdf" :
      parseStatus ? "parse-layout" :
      indexStatus ? "embed" :
      undefined;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: pipelineStatus, phase } : e));
  }, [pipelineStatus, pdfStatus, parseStatus, indexStatus]);

  useEffect(() => {
    if (!pipelineIdle || !pendingQuery) return;
    const query = pendingQuery;
    const id = pendingEntryIdRef.current;
    setPendingQuery(null);
    setIsSearching(true);
    if (id)
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: "Searching...", phase: "search" as PipelinePhase } : e));
    (async () => {
      try {
        // Perform actual search
        const results = await searchStore(query);

        if (id) {
          setEntries(prev => prev.map(e => e.id === id ? { ...e, results, status: "Generating response...", phase: "generate" as PipelinePhase } : e));

          // Generate LLM response from search results - stream the chunks
          let accumulatedResponse = "";
          for await (const chunk of generateSummary({ query, results })) {
            accumulatedResponse += chunk;
            setEntries(prev => prev.map(e =>
              e.id === id ? { ...e, llmResponse: accumulatedResponse } : e
            ));
            // Small delay to ensure React processes each update
            //await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Clear status
        if (id)
          setEntries(prev => prev.map(e => e.id === id ? { ...e, status: undefined, phase: undefined } : e));
      } catch (err) {
        console.error("Search or LLM generation failed:", err);
        if (id)
          setEntries(prev => prev.map(e => e.id === id ? { ...e, results: [], status: undefined, phase: undefined } : e));
      } finally {
        pendingEntryIdRef.current = null;
        setIsSearching(false);
      }
    })();
  }, [pipelineIdle, pendingQuery, searchStore]);

  const submit = useCallback(async (message: PromptInputMessage) => {
    const query = message.text?.trim();
    if (!query) return;
    const hasFiles = !!message.files?.length;
    const hasIndex = indexSize > 0;
    if (!hasFiles && !hasIndex) return;

    const id = String(++entryIdRef.current);
    pendingEntryIdRef.current = id;
    const fileNames = hasFiles
      ? message.files!.map(f => f.filename ?? "document.pdf")
      : undefined;
    setEntries(prev => [...prev, { id, query, fileNames, status: "Starting..." }]);

    if (hasFiles) {
      const files: File[] = [];
      for (const filePart of message.files!) {
        if (!filePart.url) continue;
        const resp = await fetch(filePart.url);
        const blob = await resp.blob();
        files.push(new File([blob], filePart.filename ?? "document.pdf", { type: "application/pdf" }));
      }
      addDocuments(files);
    }

    setPendingQuery(query);
  }, [indexSize, addDocuments]);

  const showResultPreview = useCallback((r: SearchResult | null) => setResult(r), []);

  return { entries, result, showResultPreview, submit, isProcessing };
}
