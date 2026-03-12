"use client"

import { useState } from "react"
import {
  Conversation, ConversationContent, ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader,
  PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { AddFilesButton } from "@/components/add-files-button"
import { AttachmentsDisplay } from "@/components/attachments-display"
import { ChatEntryView } from "@/components/chat-entry-view"
import { PdfPreviewPanel } from "@/components/pdf-preview-panel"
import { useDocumentSearch } from "@/hooks/use-document-search"

export default function Home() {
  const [text, setText] = useState("");
  const {
    entries,
    isProcessing,
    pdfFiles,
    selectedResult,
    indexedFileNames,
    handleSelectResult,
    handleSubmit,
    setSelectedResult,
  } = useDocumentSearch();

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

        {showPanel && selectedResult && (
          <div className="flex w-[40%] min-w-0 flex-col min-h-0">
            <PdfPreviewPanel
              result={selectedResult}
              file={pdfFiles.get(selectedResult.documentName)}
              onClose={() => setSelectedResult(null)}
            />
          </div>
        )}
      </div>

      <div className={`shrink-0 px-4 pb-4 ${showPanel ? "mx-0 w-[60%]" : "mx-auto w-full max-w-[48rem]"}`}>
        <PromptInput
          onSubmit={(msg) => {
            setText("");
            handleSubmit(msg);
          }}
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
                indexedFileNames.length > 0
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
              disabled={isProcessing}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}