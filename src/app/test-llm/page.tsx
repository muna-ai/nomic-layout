"use client"

import { useState } from "react"
import { Muna } from "muna"

const origin = typeof window !== "undefined" ? window.location.origin : "";
const muna = new Muna({ url: `${origin}/api/muna` });
const openai = muna.beta.openai;

export default function TestLLM() {
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog(prev => [...prev, msg]);
    console.log(msg);
  };

  const testEmbeddings = async () => {
    setLog([]);
    addLog('Testing embeddings (known working)...');

    try {
      addLog('Calling openai.embeddings.create...');
      const embedding = await openai.embeddings.create({
        model: "@nomic/nomic-embed-text-v1.5-quant",
        input: ["test"],
        acceleration: "local_auto"
      });

      addLog('✅ Embeddings SUCCESS!');
      addLog('Response: ' + JSON.stringify(embedding.data[0].embedding.slice(0, 5), null, 2) + '...');
    } catch (error: any) {
      addLog('❌ ERROR: ' + error.message);
    }
  };

  const testLLM = async () => {
    setLog([]);
    addLog('Testing SmolLM...');

    try {
      const messages = [
        { role: "user" as const, content: "What is 2+2?" }
      ];

      addLog('Calling openai.chat.completions.create with stream: false...');
      const response = await openai.chat.completions.create({
        model: "@anon/smollm_2_135m",
        messages,
        acceleration: "local_auto",
        stream: false,
      } as any);

      addLog('Response received!');
      addLog('Full response: ' + JSON.stringify(response, null, 2));

      const content = (response as any)?.choices?.[0]?.message?.content;
      if (content) {
        addLog('\n✅ SUCCESS!');
        addLog('Generated text: ' + content);
      } else {
        addLog('\n⚠️ No content in response');
        addLog('Choices: ' + JSON.stringify((response as any)?.choices, null, 2));
      }
    } catch (error: any) {
      addLog('\n❌ ERROR: ' + error.message);
      addLog('Stack: ' + error.stack);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Model Test</h1>
      <button
        onClick={testEmbeddings}
        style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer', marginRight: 10 }}
      >
        Test Embeddings (working)
      </button>
      <button
        onClick={testLLM}
        style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer' }}
      >
        Test @anon/smollm_2_135m
      </button>
      <pre style={{
        whiteSpace: 'pre-wrap',
        background: '#f5f5f5',
        padding: 10,
        marginTop: 10
      }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
