"use client"

import { useCallback, useState } from "react"
import { usePdfReader } from "@/hooks/use-pdf-reader"
import { useLayoutParser } from "@/hooks/use-layout-parser"
import { useVectorStore } from "@/hooks/use-vector-store"
import { useSearchChat } from "@/hooks/use-search-chat"
import { useModelStatus } from "@/hooks/use-model-status"
import {
  Conversation, ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader,
  PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { cn } from "@/lib/utils"
import type { PipelinePhase } from "@/hooks/use-search-chat"
import { AddFilesButton } from "@/components/add-files-button"
import { PipelineProgress } from "@/components/pipeline-progress"
import { AttachmentsDisplay } from "@/components/attachments-display"
import { ChatEntryView } from "@/components/chat-entry-view"
import { ModelLoadingStatus } from "@/components/model-loading-status"
import { PdfPreviewPanel } from "@/components/pdf-preview-panel"
import { PreloadAttachment } from "@/components/preload-attachment"

export default function Home() {
  const modelStatus = useModelStatus();
  // Documents & text
  const [documents, setDocuments] = useState<File[]>([]);
  const [text, setText] = useState("What CPU does the Raspberry Pi 5 use?");
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
  const modelsReady = modelStatus.layout === "ready" && modelStatus.embeddings === "ready" && modelStatus.ocr === "ready" && modelStatus.llm === "ready";
  const showPanel = result !== null;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const activePhase = lastEntry?.phase ?? null;
  const activeStatusDetail = lastEntry?.status ?? null;
  const showPipelinePanel = activePhase !== null && !showPanel;
  // Render
  return (
    <div className="flex h-svh flex-col bg-background">
      <div className="relative flex flex-1 min-h-0 flex-row overflow-hidden">
        <div className={`flex flex-col min-h-0 min-w-0 transition-all duration-300 ease-in-out ${showPanel ? "w-[60%]" : "w-full"}`}>
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
              <p className="max-w-md text-center text-sm text-muted-foreground/60">
                <a href="https://huggingface.co/nomic-ai/nomic-layout-v1" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted-foreground transition">Nomic Layout v1</a>{" "}
                parses document structure, then OCR and embeddings power semantic search.
                Inference runs locally in your browser, powered by{" "}
                <a href="https://muna.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted-foreground transition">Muna</a>.
              </p>
              <ModelLoadingStatus modelStatus={modelStatus} />
            </div>
          )}
        </div>

        {/* Pipeline progress — right side */}
        <div
          className={cn(
            "absolute inset-y-0 right-0 hidden items-center pr-10 lg:flex",
            "transition-all duration-300 ease-in-out",
            showPipelinePanel
              ? "opacity-100 translate-x-0"
              : "opacity-0 translate-x-4 pointer-events-none",
          )}
        >
          <PipelineProgress
            currentPhase={activePhase ?? ("load-pdf" as PipelinePhase)}
            statusDetail={activeStatusDetail}
          />
        </div>

        {/* PDF preview — right side */}
        <div className={`absolute inset-y-0 right-0 w-[40%] transition-transform duration-300 ease-in-out ${showPanel ? "translate-x-0" : "translate-x-full"}`}>
          {result && (
            <PdfPreviewPanel
              result={result}
              file={pdfFileMap.get(result.documentName)}
              onClose={() => showResultPreview(null)}
            />
          )}
        </div>
      </div>
      
      {/* Chat box */}
      <div className={`shrink-0 px-4 pb-4 transition-all duration-300 ease-in-out ${showPanel ? "mx-0 w-[60%]" : "mx-auto w-full max-w-[48rem]"}`}>
        <PromptInput
          onSubmit={(message) => { setText(""); submit(message); }}
          className="w-full"
          accept="application/pdf"
          multiple
          globalDrop
        >
          <PreloadAttachment url="/raspberry-5-brief.pdf" />
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
              disabled={isProcessing || !modelsReady}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
