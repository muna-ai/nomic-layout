"use client"

import { useEffect, useState } from "react"
import {
  getModelStatus,
  subscribeModelStatus,
  type ModelStatusMap,
} from "@/lib/worker-proxy"

export function useModelStatus(): ModelStatusMap {
  const [status, setStatus] = useState<ModelStatusMap>(getModelStatus);
  useEffect(() => {
    setStatus(getModelStatus());
    return subscribeModelStatus(setStatus);
  }, []);
  return status;
}
