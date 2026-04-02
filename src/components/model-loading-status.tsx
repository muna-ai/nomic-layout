"use client";

import { CheckIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ModelLoadStatus, ModelStatusMap } from "@/lib/worker-proxy"

const MODEL_INFO: { key: keyof ModelStatusMap; label: string; tag: string }[] = [
  { key: "layout", label: "Layout Detection", tag: "nomic-layout-v1" },
  { key: "embeddings", label: "Text Embeddings", tag: "nomic-embed-v1.5" },
  { key: "ocr", label: "Text Recognition", tag: "rapid-ocr" },
  { key: "llm", label: "Language Model", tag: "smollm-2-135m" },
];

export function ModelLoadingStatus({ modelStatus }: { modelStatus: ModelStatusMap }) {
  const readyCount = Object.values(modelStatus).filter((s) => s === "ready").length;
  const allReady = readyCount === MODEL_INFO.length;

  if (allReady) {
    return (
      <div className="mt-5 flex items-center gap-2 text-xs text-emerald-600/70 dark:text-emerald-400/70">
        <CheckIcon className="h-3.5 w-3.5" />
        <span>AI models loaded — ready for local inference</span>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      <div className="w-full max-w-xs rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Preparing AI models
          </span>
          <span className="text-xs text-muted-foreground/50">
            {readyCount}/{MODEL_INFO.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {MODEL_INFO.map((m) => {
            const status = modelStatus[m.key];
            return (
              <div key={m.key} className="flex items-center gap-2.5">
                <ModelStatusIcon status={status} />
                <span
                  className={cn(
                    "text-xs",
                    status === "ready" && "text-muted-foreground",
                    status === "loading" && "text-foreground",
                    status === "pending" && "text-muted-foreground/40",
                  )}
                >
                  {m.label}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/30">
                  {m.tag}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/40">
        Models are cached after first download
      </p>
    </div>
  );
}

function ModelStatusIcon({ status }: { status: ModelLoadStatus }) {
  if (status === "ready")
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15">
        <CheckIcon className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  if (status === "loading")
    return <Loader2Icon className="h-4 w-4 animate-spin text-blue-500" />;
  return (
    <div className="flex h-4 w-4 items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/25" />
    </div>
  );
}
