"use client";

import { FileTextIcon } from "lucide-react"
import type { SearchResult } from "@/lib/vector-store"
import type { ChatEntry } from "@/hooks/use-search-chat"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ResultsDisplay } from "@/components/results-display"

export interface ChatEntryViewProps {
  entry: ChatEntry;
  result: SearchResult | null;
  onShowPreview: (r: SearchResult | null) => void;
}

export function ChatEntryView({
  entry,
  result,
  onShowPreview,
}: ChatEntryViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <Message from="user">
        <MessageContent>
          <div className="flex flex-col gap-1">
            <p>
              {entry.query}
            </p>
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
      {entry.status != null && (
        <Reasoning isStreaming>
          <ReasoningTrigger
            getThinkingMessage={() => (
              <Shimmer duration={1}>{entry.status!}</Shimmer>
            )}
          />
        </Reasoning>
      )}
      {entry.results && entry.results.length > 0 && (
        <ResultsDisplay
          results={entry.results}
          result={result}
          onShowPreview={onShowPreview}
        />
      )}
      {entry.llmResponse && (
        <Message from="assistant">
          <MessageContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {entry.llmResponse}
            </div>
          </MessageContent>
        </Message>
      )}
    </div>
  );
}
