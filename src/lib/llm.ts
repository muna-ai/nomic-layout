import { Muna } from "muna"

// This module is ONLY imported by main thread, never by worker
// Create Muna instance at module load time, just like the working test page
const origin = typeof window !== "undefined" ? window.location.origin : "";
const muna = new Muna({ url: `${origin}/api/muna` });
const openai = muna.beta.openai;

export interface GenerateLLMTextInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export async function generateLLMText({
  messages
}: GenerateLLMTextInput): Promise<string> {
  console.log('LLM: Sending messages:', JSON.stringify(messages, null, 2));

  // Use exact same approach as working test page
  const response = await openai.chat.completions.create({
    model: "@anon/smollm_2_135m",
    messages,
    acceleration: "local_auto",
    stream: false,
  } as any);

  console.log('LLM: Full response:', JSON.stringify(response, null, 2));

  const content = (response as any)?.choices?.[0]?.message?.content;

  if (!content) {
    console.error('LLM: No content found in response. Choices:', (response as any)?.choices);
    // Return a fallback message instead of throwing
    return "I couldn't generate a response. Please try again with a shorter question.";
  }

  console.log('LLM: Generated content:', content);
  return content;
}
