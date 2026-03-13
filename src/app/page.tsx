"use client"

import { useCallback, useEffect, useState } from "react"
import { usePdfReader } from "@/hooks/use-pdf-reader"
import { useLayoutParser } from "@/hooks/use-layout-parser"
import { useVectorStore } from "@/hooks/use-vector-store"
import { useSearchChat } from "@/hooks/use-search-chat"
import { initWorker } from "@/lib/worker-proxy"
import {
  Conversation, ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader,
  PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { AddFilesButton } from "@/components/add-files-button"
import { AttachmentsDisplay } from "@/components/attachments-display"
import { ChatEntryView } from "@/components/chat-entry-view"
import { PdfPreviewPanel } from "@/components/pdf-preview-panel"

export default function Home() {
  useEffect(() => { initWorker(); }, []);
  // Documents & text
  const [documents, setDocuments] = useState<File[]>([]);
  const [text, setText] = useState("");
  // Pipeline
  const { pages, status: pdfStatus } = usePdfReader({ documents });
  const { elements, status: parseStatus } = useLayoutParser({ pages });
  const { searchStore, status: indexStatus, indexSize } = useVectorStore({ elements });
  // Chat
  const addDocuments = useCallback((files: File[]) => setDocuments(prev => [...prev, ...files]), []);
  const { entries, result, showResultPreview, submit, isProcessing } = useSearchChat({
    pdfStatus,
    parseStatus,
    indexStatus,
    indexSize,
    searchStore,
    addDocuments,
  });
  // Build a map of File objects for the preview panel
  const pdfFileMap = new Map<string, File>();
  for (const doc of documents)
    pdfFileMap.set(doc.name, doc);
  const showPanel = result !== null;
  // Render
  return (
    <div className="flex h-svh flex-col bg-background">
      <div className={`flex flex-1 min-h-0 ${showPanel ? "flex-row" : ""}`}>
        <div className={`flex flex-col min-h-0 ${showPanel ? "w-[60%] min-w-0" : "flex-1"}`}>
          {entries.length > 0 ? (
            <Conversation className="flex-1">
              <ConversationContent className="mx-auto w-full max-w-[48rem] gap-6 pb-4 pt-8">
                {entries.map((entry) => (
                  <ChatEntryView
                    key={entry.id}
                    entry={entry}
                    result={result}
                    onShowPreview={showResultPreview}
                  />
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center">
              <h1 className="mb-2 text-[28px] font-normal text-foreground/80">
                What would you like to find?
              </h1>
              <p className="text-sm text-muted-foreground/60">
                <a href="https://huggingface.co/nomic-ai/nomic-layout-v1" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted-foreground transition">Nomic Layout v1</a>, powered by <a href="https://muna.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted-foreground transition">Muna</a>.
              </p>
            </div>
          )}
        </div>

        {
          showPanel && result &&
          <div className="flex w-[40%] min-w-0 flex-col min-h-0">
            <PdfPreviewPanel
              result={result}
              file={pdfFileMap.get(result.documentName)}
              onClose={() => showResultPreview(null)}
            />
          </div>
        }
      </div>

      <div className={`shrink-0 px-4 pb-4 ${showPanel ? "mx-0 w-[60%]" : "mx-auto w-full max-w-[48rem]"}`}>
        <PromptInput
          onSubmit={(message) => { setText(""); submit(message); }}
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
                  : "Upload a PDF and ask anything"
              }
              className="min-h-[44px] px-8 py-2 text-base"
            />
          </PromptInputBody>
          <PromptInputFooter className="px-5">
            <PromptInputTools>
              <AddFilesButton />
            </PromptInputTools>
            <PromptInputSubmit
              className="rounded-full"
              disabled={isProcessing}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}