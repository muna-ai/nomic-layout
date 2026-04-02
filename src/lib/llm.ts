import { Muna } from "muna"

// This module is ONLY imported by main thread, never by worker
// Create Muna instance at module load time, just like the working test page
const origin = typeof window !== "undefined" ? window.location.origin : "";
const muna = new Muna({ url: `${origin}/api/muna` });
const openai = muna.beta.openai;

export interface GenerateLLMTextInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export async function* generateLLMText({
  messages
}: GenerateLLMTextInput): AsyncGenerator<string, void, unknown> {
  console.log('LLM: Sending messages (streaming):', JSON.stringify(messages, null, 2));

  // Enable streaming
  const stream = await openai.chat.completions.create({
    model: "@anon/smollm_2_135m",
    messages,
    acceleration: "local_auto",
    stream: true,
  } as any);

  console.log('LLM: Stream started');

  try {
    for await (const chunk of stream as any) {
      const content = chunk?.choices?.[0]?.delta?.content;
      if (content) {
        // console.log('LLM chunk:', content);
        yield content;
      }
    }
    console.log('LLM: Stream complete');
  } catch (error) {
    console.error('LLM streaming error:', error);
    yield "I couldn't generate a response. Please try again.";
  }
}
