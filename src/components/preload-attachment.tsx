"use client"

import { useEffect, useRef } from "react"
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input"

export function PreloadAttachment({ url }: { url: string }) {
  const attachments = usePromptInputAttachments();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current)
      return;
    loaded.current = true;
    (async () => {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const filename = url.split("/").pop() ?? "document.pdf";
        const file = new File([blob], filename, { type: blob.type || "application/pdf" });
        attachments.add([file]);
      } catch (err) {
        console.error("Failed to preload attachment:", err);
      }
    })();
  }, [attachments, url]);
  return null;
}