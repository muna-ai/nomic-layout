import type { SearchResult } from "./vector-store"

/**
 * Build a conversation prompt for the LLM to summarize search results.
 */
export function buildSummaryPrompt(
  query: string,
  results: SearchResult[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // Use full text of top 2 results for complete context
  const contextParts: string[] = [];
  const maxResults = Math.min(results.length, 2); // Top 2 results only

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    // Use full text, no truncation
    contextParts.push(result.text);
  }

  const contextBlock = contextParts.join("\n");

  // Minimal extraction prompt - just context and question
  const userMessage = {
    role: "user" as const,
    content: `${contextBlock}\n${query}`
  };

  // Debug: Log what we're sending to the LLM
  // console.log('=== PROMPT BUILDER DEBUG ===');
  // console.log('Query:', query);
  // console.log('Number of results:', results.length);
  // console.log('Context parts:', contextParts);
  // console.log('Full prompt:', userMessage.content);
  // console.log('=== END DEBUG ===');

  return [userMessage];
}
