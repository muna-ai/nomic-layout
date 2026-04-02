import type { SearchResult } from "./vector-store"

/**
 * Build a conversation prompt for the LLM to summarize search results.
 */
export function buildSummaryPrompt(
  query: string,
  results: SearchResult[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // Expand context for better quality answers
  const contextParts: string[] = [];
  const maxResults = Math.min(results.length, 5); // Increased from 2 to 5

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    // Increased character limit from 100 to 300
    const text = result.text.length > 300
      ? result.text.slice(0, 300) + "..."
      : result.text;

    contextParts.push(text);
  }

  const contextBlock = contextParts.join("\n\n");

  // Improved prompt structure
  const userMessage = {
    role: "user" as const,
    content: `Q: ${query}\n\nContext:\n${contextBlock}\n\nA:`
  };

  return [userMessage];
}
