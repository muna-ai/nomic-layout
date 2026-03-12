"use client";

import {
  PromptInputButton,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { PlusIcon } from "lucide-react";

export function AddFilesButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      tooltip="Attach PDFs"
      onClick={() => attachments.openFileDialog()}
    >
      <PlusIcon className="size-4" />
    </PromptInputButton>
  );
}
