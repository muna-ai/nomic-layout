"use client";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { FileTextIcon } from "lucide-react";

export function AttachmentsDisplay() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
        >
          <AttachmentPreview
            fallbackIcon={
              <FileTextIcon className="size-3 text-muted-foreground" />
            }
          />
          <span className="max-w-[120px] truncate text-xs">
            {attachment.filename}
          </span>
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
