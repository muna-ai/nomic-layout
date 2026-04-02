interface PendingCall {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  onChunk?: (chunk: any) => void;
}

/**
 * Generic RPC proxy over a Web Worker. Post `{ id, method, args }` messages
 * and resolve the matching promise when `{ id, result }` or `{ id, error }`
 * comes back. Works with any worker that follows this message protocol.
 *
 * Pass a pre-constructed Worker so that bundlers (webpack/turbopack) can
 * statically detect the `new Worker(new URL(...))` pattern at the call site.
 */
export class WorkerProxy {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, PendingCall>();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, result, error, stack, chunk } = e.data;
      const p = this.pending.get(id);
      if (!p)
        return;
      // Handle streaming chunks
      if (chunk !== undefined) {
        if (typeof (p as any).onChunk === "function") {
          (p as any).onChunk(chunk);
        }
        return;
      }
      // Handle final result or error
      this.pending.delete(id);
      if (error !== undefined) {
        const err = new Error(error);
        if (stack) err.stack = stack;
        p.reject(err);
      } else {
        p.resolve(result);
      }
    };
    this.worker.onerror = (e) => {
      console.error("[WorkerProxy] uncaught worker error:", e);
    };
  }

  call<T>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      // Extract onChunk callback if present in args and remove it from serializable args
      let onChunk: ((chunk: any) => void) | undefined;
      let cleanArgs = args;

      if (args.length > 0 && args[0] && typeof (args[0] as any)?.onChunk === "function") {
        onChunk = (args[0] as any).onChunk;
        // Create a copy of args with onChunk replaced by a flag
        cleanArgs = args.map((arg, idx) => {
          if (idx === 0 && typeof arg === 'object' && arg !== null) {
            const { onChunk: _, ...rest } = arg as any;
            return { ...rest, __hasStreamCallback: true };
          }
          return arg;
        });
      }

      this.pending.set(id, { resolve, reject, onChunk });
      this.worker.postMessage({ id, method, args: cleanArgs });
    });
  }

  terminate() {
    this.worker.terminate();
    for (const p of this.pending.values()) {
      p.reject(new Error("Worker terminated"));
    }
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers for wiring up a worker with minimal boilerplate
// ---------------------------------------------------------------------------

export type ModelLoadStatus = "pending" | "loading" | "ready";

export interface ModelStatusMap {
  layout: ModelLoadStatus;
  embeddings: ModelLoadStatus;
  ocr: ModelLoadStatus;
  llm: ModelLoadStatus;
}

let currentModelStatus: ModelStatusMap = {
  layout: "pending",
  embeddings: "pending",
  ocr: "pending",
  llm: "pending",
};

const modelStatusListeners = new Set<(status: ModelStatusMap) => void>();

export function getModelStatus(): ModelStatusMap {
  return { ...currentModelStatus };
}

export function subscribeModelStatus(
  listener: (status: ModelStatusMap) => void
): () => void {
  modelStatusListeners.add(listener);
  return () => { modelStatusListeners.delete(listener); };
}

let proxy: WorkerProxy | null = null;

function getProxy(): WorkerProxy {
  if (!proxy) {
    const worker = new Worker(
      new URL("./inference.worker.ts", import.meta.url)
    );
    worker.addEventListener("message", (e: MessageEvent) => {
      if (e.data.type === "preload") {
        const { model, status } = e.data as { model: keyof ModelStatusMap; status: ModelLoadStatus };
        currentModelStatus = { ...currentModelStatus, [model]: status };
        for (const listener of modelStatusListeners)
          listener({ ...currentModelStatus });
      }
    });
    proxy = new WorkerProxy(worker);
  }
  return proxy;
}

/**
 * Call a function on the worker thread instead of the main thread.
 * Uses `fn.name` to route to the matching export in the worker module.
 *
 * ```ts
 * import { parseLayout } from "@/lib/inference";
 * const result = await postToWorkerThread(parseLayout, { image });
 * ```
 */
export function postToWorkerThread<
  T extends (...args: any[]) => Promise<any>,
>(fn: T, ...args: Parameters<T>): ReturnType<T> {
  return getProxy().call(fn.name, ...args) as ReturnType<T>;
}

/**
 * Eagerly create the worker so model preloading starts immediately.
 * Safe to call multiple times — only the first call has an effect.
 */
export function initWorker(): void {
  getProxy();
}