import { useEffect, useRef, useState } from "react"
import { loadPdf, type PageData } from "@/lib/pdf"

export interface Page extends PageData {
  documentName: string;
  file: File;
}

export interface UsePdfReaderInput {
  documents: File[];
}

export interface UsePdfReaderReturn {
  pages: Page[];
  status: string | null;
}

export function usePdfReader({ documents }: UsePdfReaderInput): UsePdfReaderReturn {
  // State to track pages
  const [pages, setPages] = useState<Page[]>([]);
  const processedCountRef = useRef(0);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const hasPending = processedCountRef.current < documents.length;
  const status = hasPending ? (activeStatus ?? "Preparing...") : null;
  // Read pages with pdf.js
  useEffect(() => {
    if (processedCountRef.current >= documents.length)
      return;
    let cancelled = false;
    (async () => {
      const pending = documents.slice(processedCountRef.current);
      for (const file of pending) {
        if (cancelled) return;
        const pageDataList = await loadPdf(file, (pageNum, total) => {
          if (!cancelled)
            setActiveStatus(`Loading ${file.name} (page ${pageNum}/${total})...`);
        });
        if (cancelled)
          return;
        const newPages: Page[] = pageDataList.map((pd) => ({
          ...pd,
          documentName: file.name,
          file,
        }));
        setPages((prev) => [...prev, ...newPages]);
        processedCountRef.current++;
      }
      setActiveStatus(null);
    })();
    return () => { cancelled = true; };
  }, [documents]);
  // Return
  return { pages, status };
}
