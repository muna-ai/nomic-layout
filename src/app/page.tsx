"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Conversation, ConversationContent, ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader,
  type PromptInputMessage, PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { AddFilesButton } from "@/components/add-files-button"
import { AttachmentsDisplay } from "@/components/attachments-display"
import { ChatEntryView, type ChatEntry } from "@/components/chat-entry-view"
import { PdfPreviewPanel } from "@/components/pdf-preview-panel"
import { usePdfReader } from "@/hooks/use-pdf-reader"
import { useLayoutParser } from "@/hooks/use-layout-parser"
import { useVectorStore } from "@/hooks/use-vector-store"
import type { SearchResult } from "@/lib/vector-store"

export default function Home() {
  const [text, setText] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const pendingEntryIdRef = useRef<string | null>(null);
  const entryIdRef = useRef(0);
  // Pipeline
  const { pages, status: pdfStatus } = usePdfReader({ documents });
  const { elements, status: parseStatus } = useLayoutParser({ pages });
  const { searchStore, status: indexStatus, indexSize } = useVectorStore({ elements });
  const pipelineIdle = !pdfStatus && !parseStatus && !indexStatus;
  const pipelineStatus = pdfStatus ?? parseStatus ?? indexStatus;
  const isProcessing = !!pendingQuery;
  // Update the active entry's status as the pipeline progresses
  useEffect(() => {
    if (!pendingEntryIdRef.current || !pipelineStatus)
      return;
    const id = pendingEntryIdRef.current;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status: pipelineStatus } : e)));
  }, [pipelineStatus]);
  // When pipeline settles and there's a pending query, run the search
  useEffect(() => {
    if (!pipelineIdle || !pendingQuery)
      return;
    const query = pendingQuery;
    const id = pendingEntryIdRef.current;
    setPendingQuery(null);
    setIsSearching(true);
    if (id) {
      setEntries(prev => prev.map((e) => (e.id === id ? { ...e, status: "Searching..." } : e)));
    }
    (async () => {
      try {
        const results = await searchStore(query);
        if (id) {
          setEntries((prev) =>
            prev.map((e) => e.id === id ? { ...e, results, status: undefined } : e)
          );
        }
      } catch (err) {
        console.error("Search failed:", err);
        if (id) {
          setEntries((prev) =>
            prev.map((e) => e.id === id ? { ...e, results: [], status: undefined } : e)
          );
        }
      } finally {
        pendingEntryIdRef.current = null;
        setIsSearching(false);
      }
    })();
  }, [pipelineIdle, pendingQuery, searchStore]);

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

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    const query = message.text?.trim();
    if (!query)
      return;

    const hasFiles = !!message.files?.length;
    const hasIndex = indexSize > 0;
    if (!hasFiles && !hasIndex) return;

    setText("");
    const id = String(++entryIdRef.current);
    pendingEntryIdRef.current = id;

    const fileNames = hasFiles
      ? message.files!.map((f) => f.filename ?? "document.pdf")
      : undefined;

    setEntries((prev) => [
      ...prev,
      { id, query, fileNames, status: "Starting..." },
    ]);

    if (hasFiles) {
      const files: File[] = [];
      for (const filePart of message.files!) {
        if (!filePart.url) continue;
        const resp = await fetch(filePart.url);
        const blob = await resp.blob();
        files.push(
          new File([blob], filePart.filename ?? "document.pdf", {
            type: "application/pdf",
          })
        );
      }
      setDocuments((prev) => [...prev, ...files]);
    }

    setPendingQuery(query);
  }, [indexSize]);

  // Build a map of File objects for the preview panel
  const pdfFileMap = new Map<string, File>();
  for (const doc of documents) pdfFileMap.set(doc.name, doc);

  const hasEntries = entries.length > 0;
  const showPanel = selectedResult !== null;

  return (
    <div className="flex h-svh flex-col bg-background">
      <div className={`flex flex-1 min-h-0 ${showPanel ? "flex-row" : ""}`}>
        <div className={`flex flex-col min-h-0 ${showPanel ? "w-[60%] min-w-0" : "flex-1"}`}>
          {hasEntries ? (
            <Conversation className="flex-1">
              <ConversationContent className="mx-auto w-full max-w-[48rem] gap-6 pb-4 pt-8">
                {entries.map((entry) => (
                  <ChatEntryView
                    key={entry.id}
                    entry={entry}
                    selectedResult={selectedResult}
                    onSelectResult={handleSelectResult}
                  />
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <h1 className="mb-4 text-[28px] font-normal text-foreground/80">
                What would you like to find?
              </h1>
            </div>
          )}
        </div>

        {
          showPanel && selectedResult &&
          <div className="flex w-[40%] min-w-0 flex-col min-h-0">
            <PdfPreviewPanel
              result={selectedResult}
              file={pdfFileMap.get(selectedResult.documentName)}
              onClose={() => setSelectedResult(null)}
            />
          </div>
        }
      </div>

      <div className={`shrink-0 px-4 pb-4 ${showPanel ? "mx-0 w-[60%]" : "mx-auto w-full max-w-[48rem]"}`}>
        <PromptInput
          onSubmit={handleSubmit}
          className="w-full"
          accept="application/pdf"
          multiple
          globalDrop
        >
          <PromptInputHeader>
            <AttachmentsDisplay />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              onChange={(e) => setText(e.target.value)}
              value={text}
              placeholder={
                documents.length > 0
                  ? "Ask a follow-up or attach more PDFs"
                  : "Ask anything"
              }
              className="min-h-[44px] px-8 py-3 text-[15px]"
            />
          </PromptInputBody>
          <PromptInputFooter className="px-5">
            <PromptInputTools>
              <AddFilesButton />
            </PromptInputTools>
            <PromptInputSubmit
              className="rounded-full"
              disabled={isProcessing || isSearching}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}