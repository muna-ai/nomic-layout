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
    // Handle streaming for generateText
    if (method === "generateText" && args.length > 0 && args[0].__hasStreamCallback) {
      const modifiedArgs = [...args];
      // Remove the flag and add the actual onChunk that posts to main thread
      const { __hasStreamCallback, ...restArgs } = modifiedArgs[0];
      modifiedArgs[0] = {
        ...restArgs,
        onChunk: (chunk: string) => {
          self.postMessage({ id, chunk });
        }
      };
      const result = await fn(...modifiedArgs);
      self.postMessage({ id, result });
    } else {
      const result = await fn(...args);
      self.postMessage({ id, result });
    }
  } catch (err: any) {
    self.postMessage({
      id,
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
  }
};
