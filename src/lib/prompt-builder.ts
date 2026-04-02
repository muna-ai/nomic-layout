import type { SearchResult } from "./vector-store"

/**
 * Build a conversation prompt for the LLM to summarize search results.
 */
export function buildSummaryPrompt(
  query: string,
  results: SearchResult[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // System message to set behavior
  const systemMessage = {
    role: "system" as const,
    content: "You are a helpful assistant that answers questions based on provided document excerpts. Be concise and conversational. Cite specific information from the context when relevant."
  };

  // Build context from search results
  const contextParts: string[] = [];

  // Limit context to avoid token overflow (SmolLM has limited context window)
  const maxResults = Math.min(results.length, 7);

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    // Truncate very long text to save tokens
    const text = result.text.length > 500
      ? result.text.slice(0, 500) + "..."
      : result.text;

    contextParts.push(
      `[Document: ${result.documentName}, Page ${result.pageNumber}, ${result.type}]\n${text}`
    );
  }

  const contextBlock = contextParts.join("\n\n---\n\n");

  // User message with context + question
  const userMessage = {
    role: "user" as const,
    content: `Based on the following excerpts from documents, please answer this question:\n\n"${query}"\n\n---\n\n${contextBlock}\n\n---\n\nPlease provide a clear, conversational answer based on the information above.`
  };

  return [systemMessage, userMessage];
}
