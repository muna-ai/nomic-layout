"use client"

import { renderPdfPage } from "@/lib/pdf"
import type { SearchResult } from "@/lib/vector-store"
import { XIcon } from "lucide-react"
import { useEffect, useRef } from "react"

const LABEL_BORDER_COLORS: Record<string, string> = {
  Title: "rgb(239 68 68)",
  Text: "rgb(34 197 94)",
  "Section-header": "rgb(59 130 246)",
  Table: "rgb(249 115 22)",
  Picture: "rgb(168 85 247)",
  "List-item": "rgb(20 184 166)",
  "Key-Value Region": "rgb(190 24 93)",
  "Page-header": "rgb(107 114 128)",
  "Page-footer": "rgb(163 163 163)",
};

function getLabelColor(label: string): string {
  return LABEL_BORDER_COLORS[label] ?? "rgb(59 130 246)";
}

export function PdfPreviewPanel({
  result,
  file,
  onClose,
}: {
  result: SearchResult;
  file: File | undefined;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const borderColor = getLabelColor(result.type);

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    const { cancel, promise } = renderPdfPage(file, result.pageNumber, canvasRef.current);
    promise.catch(console.error);
    return () => cancel();
  }, [file, result.pageNumber]);

  if (!file) {
    return (
      <div className="flex flex-1 flex-col border-l border-border/60 bg-muted/20">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            {result.documentName} (p. {result.pageNumber})
          </span>
          <button
            type="button"
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
          Document not available for preview.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col border-l border-border/60 bg-muted/20">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="truncate text-sm font-medium text-foreground">
          {result.documentName} — p. {result.pageNumber}
        </span>
        <button
          type="button"
          aria-label="Close"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="relative inline-block max-w-full">
          <canvas
            ref={canvasRef}
            className="max-h-[85vh] w-full max-w-full object-contain"
            style={{ display: "block" }}
          />
          <div
            className="pointer-events-none absolute border-2 bg-black/20"
            style={{
              left: `${result.xMin * 100}%`,
              top: `${result.yMin * 100}%`,
              width: `${(result.xMax - result.xMin) * 100}%`,
              height: `${(result.yMax - result.yMin) * 100}%`,
              borderColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
