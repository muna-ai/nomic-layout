import * as methods from "./inference"

methods.preloadModels((model, status) => {
  self.postMessage({ type: "preload", model, status });
});

self.onmessage = async (e: MessageEvent) => {
  const { id, method, args } = e.data;
  const fn = (methods as Record<string, any>)[method];
  if (typeof fn !== "function") {
    self.postMessage({ id, error: `Unknown method: ${method}` });
    return;
  }
  try {
    const result = await fn(...args);
    self.postMessage({ id, result });
  } catch (err: any) {
    self.postMessage({
      id,
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
  }
};
