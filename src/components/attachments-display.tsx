"use client"

import { FileTextIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input"

export function AttachmentsDisplay() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0)
    return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.files.map((attachment) => (
        <div
          key={attachment.id}
          className="group relative flex items-center rounded-lg border border-border/80 bg-neutral-800 ring-1 ring-border/30"
        >
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50 rounded-lg"
          >
            <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
              {attachment.url && attachment.mediaType === "application/pdf" ? (
                <PdfThumbnail url={attachment.url} />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <FileTextIcon className="size-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <span className="max-w-[160px] truncate text-sm text-foreground">
              {attachment.filename}
            </span>
          </a>
          <button
            type="button"
            onClick={() => attachments.remove(attachment.id)}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const resp = await fetch(url);
      const buffer = await resp.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 0.4 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) { doc.destroy(); return; }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as any,
        canvasContext: ctx as any,
        viewport,
      }).promise;
      page.cleanup();
      doc.destroy();
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <canvas
      ref={canvasRef}
      className={`size-full object-cover transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}
