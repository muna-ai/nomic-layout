"use client"

import type { SearchResult } from "@/lib/vector-store"
import { FileTextIcon } from "lucide-react"

export function ResultCard({
  result,
  onSelect,
  isSelected,
}: {
  result: SearchResult;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const score = Math.round(result.similarityScore * 100);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 ${
        isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border/60"
      }`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileTextIcon className="size-3.5" />
          <span>{result.documentName}</span>
          <span>p. {result.pageNumber}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {result.type}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {score}%
          </span>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">
        {result.text}
      </p>
    </div>
  );
}