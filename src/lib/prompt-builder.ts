import type { SearchResult } from "./vector-store"

/**
 * Build a conversation prompt for the LLM to summarize search results.
 */
export function buildSummaryPrompt(
  query: string,
  results: SearchResult[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // Maximize context for better quality answers
  const contextParts: string[] = [];
  const maxResults = Math.min(results.length, 7); // Increased from 5 to 7

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    // Increased character limit from 300 to 500 for more context
    const text = result.text.length > 500
      ? result.text.slice(0, 500) + "..."
      : result.text;

    contextParts.push(text);
  }

  const contextBlock = contextParts.join("\n\n");

  // Simpler, more direct prompt without system message
  // SmolLM 135M works better with minimal prompting
  const userMessage = {
    role: "user" as const,
    content: `Based on this information:\n\n${contextBlock}\n\nQuestion: ${query}\nAnswer:`
  };

  return [userMessage];
}
