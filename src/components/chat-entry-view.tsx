"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResultsDisplay } from "@/components/results-display";
import type { ChatEntry } from "@/hooks/use-document-search";
import type { SearchResult } from "@/lib/vector-store";
import { FileTextIcon } from "lucide-react";

export function ChatEntryView({
  entry,
  selectedResult,
  onSelectResult,
}: {
  entry: ChatEntry;
  selectedResult: SearchResult | null;
  onSelectResult: (r: SearchResult) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Message from="user">
        <MessageContent>
          <div className="flex flex-col gap-1">
            <p className="text-sm">{entry.query}</p>
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
      {entry.result && (
        <ResultsDisplay
          result={entry.result}
          selectedResult={selectedResult}
          onSelectResult={onSelectResult}
        />
      )}
    </div>
  );
}
