"use client"

import { useEffect, useState } from "react"
import { preloadModels } from "@/lib/ai"

export type ModelLoadStatus = "pending" | "loading" | "ready";

export interface ModelStatusMap {
  layout: ModelLoadStatus;
  embeddings: ModelLoadStatus;
  ocr: ModelLoadStatus;
}

const INITIAL_STATUS: ModelStatusMap = {
  layout: "pending",
  embeddings: "pending",
  ocr: "pending",
};

let preloadStarted = false;
let currentStatus: ModelStatusMap = { ...INITIAL_STATUS };
const listeners = new Set<(status: ModelStatusMap) => void>();

function startPreload() {
  if (preloadStarted)
    return;
  preloadStarted = true;
  preloadModels((model, status) => {
    currentStatus = { ...currentStatus, [model]: status };
    for (const listener of listeners)
      listener({ ...currentStatus });
  });
}

export function useModelStatus(): ModelStatusMap {
  const [status, setStatus] = useState<ModelStatusMap>(() => currentStatus);
  useEffect(() => {
    startPreload();
    listeners.add(setStatus);
    setStatus({ ...currentStatus });
    return () => { listeners.delete(setStatus); };
  }, []);
  return status;
}
