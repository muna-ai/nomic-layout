"use client";

import { useEffect, useRef } from "react"
import { FileTextIcon } from "lucide-react"
import type { SearchResult } from "@/lib/vector-store"
import type { ChatEntry } from "@/hooks/use-search-chat"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"

export interface ChatEntryViewProps {
  entry: ChatEntry;
  onShowPreview: (result: SearchResult) => void;
}

export function ChatEntryView({ entry, onShowPreview }: ChatEntryViewProps) {
  const responseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (entry.llmResponse && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [entry.llmResponse]);
  const isStreaming = !!entry.status;
  const citations = entry.results?.slice(0, 2) ?? [];
  return (
    <div className="flex flex-col gap-6">
      <Message from="user">
        <MessageContent>
          <div className="flex flex-col gap-1">
            <p>{entry.query}</p>
            {entry.fileNames && entry.fileNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {entry.fileNames.map((name, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-md bg-background/50 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <FileTextIcon className="size-3" />
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </MessageContent>
      </Message>
      {
        isStreaming &&
        <Reasoning isStreaming>
          <ReasoningTrigger
            getThinkingMessage={() => (
              <Shimmer duration={1}>{entry.status!}</Shimmer>
            )}
          />
        </Reasoning>
      }
      {entry.llmResponse != null && (
        <Message from="assistant" ref={responseRef}>
          <MessageContent>
            <MessageResponse>{entry.llmResponse}</MessageResponse>
            {!isStreaming && citations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                {citations.map((r, i) => (
                  <button
                    type="button"
                    key={`${r.documentName}-${r.pageNumber}-${i}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                    onClick={() => onShowPreview(r)}
                  >
                    <FileTextIcon className="size-3 shrink-0" />
                    <span className="truncate">{r.documentName}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="shrink-0">p.{r.pageNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </MessageContent>
        </Message>
      )}
    </div>
  );
}
