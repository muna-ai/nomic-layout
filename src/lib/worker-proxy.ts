interface PendingCall {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
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
      const { id, result, error, stack } = e.data;
      const p = this.pending.get(id);
      if (!p)
        return;
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
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
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

let proxy: WorkerProxy | null = null;

function getProxy(): WorkerProxy {
  if (!proxy) {
    const worker = new Worker(
      new URL("./inference.worker.ts", import.meta.url)
    );
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