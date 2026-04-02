import type { SearchResult } from "./vector-store"

/**
 * Build a conversation prompt for the LLM to summarize search results.
 */
export function buildSummaryPrompt(
  query: string,
  results: SearchResult[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // Keep it extremely short due to memory constraints of SmolLM 135M
  const contextParts: string[] = [];
  const maxResults = Math.min(results.length, 2); // Reduced from 7 to 2

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    // Much shorter excerpts - only 100 chars instead of 500
    const text = result.text.length > 100
      ? result.text.slice(0, 100) + "..."
      : result.text;

    contextParts.push(text); // Removed metadata to save tokens
  }

  const contextBlock = contextParts.join("\n\n");

  // Very minimal prompt to save memory
  const userMessage = {
    role: "user" as const,
    content: `Q: ${query}\n\nContext:\n${contextBlock}\n\nA:`
  };

  return [userMessage]; // No system message to save tokens
}
