"use client"

import { Message, MessageContent } from "@/components/ai-elements/message"
import { ResultCard } from "@/components/result-card"
import type { SearchResult } from "@/lib/vector-store"

export interface ResultsDisplayProps {
  results: SearchResult[];
  result: SearchResult | null;
  onShowPreview: (r: SearchResult | null) => void;
}

export function ResultsDisplay({
  results,
  result,
  onShowPreview,
}: ResultsDisplayProps) {
  if (results.length === 0) {
    return (
      <Message from="assistant">
        <MessageContent>
          <p className="text-sm text-muted-foreground">
            No matching results found.
          </p>
        </MessageContent>
      </Message>
    );
  }
  return (
    <Message from="assistant">
      <MessageContent className="overflow-visible">
        <p className="mb-3 text-sm text-muted-foreground">
          Found {results.length} results
        </p>
        <div className="flex flex-col gap-3">
          {results.map((r, i) => (
            <ResultCard
              key={`${r.documentName}-${r.pageNumber}-${r.roiIndex}-${i}`}
              result={r}
              isSelected={
                result !== null &&
                result.documentName === r.documentName &&
                result.pageNumber === r.pageNumber &&
                result.roiIndex === r.roiIndex
              }
              onSelect={() => onShowPreview(r)}
            />
          ))}
        </div>
      </MessageContent>
    </Message>
  );
}
