"use client";

import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PipelinePhase } from "@/hooks/use-search-chat"

export interface PipelineProgressProps {
  currentPhase: PipelinePhase;
  statusDetail?: string | null;
}

export function PipelineProgress({
  currentPhase,
  statusDetail,
}: PipelineProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.phase === currentPhase);
  return (
    <div className="flex w-64 flex-col">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
        Pipeline
      </h3>

      <div className="flex flex-col">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isActive = index === currentIndex;
          const isPending = index > currentIndex;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.phase} className="flex items-stretch gap-3">
              {/* Indicator + connector */}
              <div className="flex flex-col items-center">
                {isComplete ? (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                ) : isActive ? (
                  <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                    <span className="absolute h-6 w-6 animate-ping rounded-full bg-blue-500/20" />
                    <span className="h-3 w-3 rounded-full bg-blue-500" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                  </div>
                )}
                {!isLast && (
                  <div
                    className={cn(
                      "w-px min-h-4 flex-1",
                      isComplete ? "bg-emerald-500/30" : "bg-border",
                    )}
                  />
                )}
              </div>

              {/* Label + description */}
              <div className={cn("flex flex-col pb-5", isLast && "pb-0")}>
                <span
                  className={cn(
                    "text-sm font-medium leading-6",
                    isComplete && "text-muted-foreground",
                    isActive && "text-foreground",
                    isPending && "text-muted-foreground/30",
                  )}
                >
                  {step.label}
                </span>
                <p
                  className={cn(
                    "mt-0.5 text-xs leading-relaxed",
                    isComplete && "text-muted-foreground/40",
                    isActive && "text-muted-foreground",
                    isPending && "text-muted-foreground/20",
                  )}
                >
                  {step.description}
                </p>
                {isActive && statusDetail && (
                  <span className="mt-1.5 text-xs font-medium text-blue-500">
                    {statusDetail}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border/50 pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground/50">
          All processing runs locally via WebAssembly.
          Your documents never leave your device.
        </p>
      </div>
    </div>
  );
}

interface Step {
  phase: PipelinePhase;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  {
    phase: "load-pdf",
    label: "Reading PDF",
    description: "Extracting pages and text layers with pdf.js, entirely in your browser.",
  },
  {
    phase: "parse-layout",
    label: "Analyzing Layout",
    description: "Nomic Layout v1 detects headings, text blocks, tables, and images entirely in your browser.",
  },
  {
    phase: "embed",
    label: "Creating Embeddings",
    description: "Nomic Embed v1.5 builds a semantic vector index locally in the browser.",
  },
  {
    phase: "search",
    label: "Searching",
    description: "Finding the most relevant regions using vector similarity search.",
  },
  {
    phase: "summarize",
    label: "Summarizing Results",
    description: "SmolLM 2 135M creates a conversational summary based on the search results.",
  },
];