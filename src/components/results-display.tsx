"use client"

import { Message, MessageContent } from "@/components/ai-elements/message"
import { ResultCard } from "@/components/result-card"
import type { SearchResult } from "@/lib/vector-store"

export function ResultsDisplay({
  results,
  selectedResult,
  onSelectResult,
}: {
  results: SearchResult[];
  selectedResult: SearchResult | null;
  onSelectResult: (r: SearchResult) => void;
}) {
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
      <MessageContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Found {results.length} results
        </p>
        <div className="flex flex-col gap-3">
          {results.map((r, i) => (
            <ResultCard
              key={`${r.documentName}-${r.pageNumber}-${r.roiIndex}-${i}`}
              result={r}
              isSelected={
                selectedResult !== null &&
                selectedResult.documentName === r.documentName &&
                selectedResult.pageNumber === r.pageNumber &&
                selectedResult.roiIndex === r.roiIndex
              }
              onSelect={() => onSelectResult(r)}
            />
          ))}
        </div>
      </MessageContent>
    </Message>
  );
}
