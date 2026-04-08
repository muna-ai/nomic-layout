# Nomic Layout
Empower your AI agents to find specific information in large, complex PDF documents using [Nomic's](https://nomic.ai) layout parsing model.

## Using the Web Demo
We have built a web demo, allowing users to upload PDFs and ask questions. The web demo runs layout detection, OCR, text embeddings, and LLM-based generation directly in the browser:

https://github.com/user-attachments/assets/8a60b2f3-746c-4170-afef-b9a9ef73a1fe

To try it yourself, create a `.env.local` in the project root and add your Muna access key. You can sign up at [muna.ai/settings/developer](http://muna.ai/settings/developer) and create a key:
```sh
# Muna access key
MUNA_ACCESS_KEY="muna_****"
```

Then start the Next.js development server:
```sh
# Run the web app
$ npm run dev
```

## Using the Agent Skill
Ask your AI agent natural-language questions about your PDF documents and get precise, cited answers. The skill uses layout detection, OCR, and text embeddings to index every text region across your PDFs, then performs vector search to find the most relevant passages.

> [!TIP]
> It works equally well with born-digital PDFs and scanned documents.

First, install the skill in your AI agent:
```sh
# Install the Nomic Layout skill
$ npx skills add muna-ai/nomic-layout
```

Then create a `.env` in your project root and add your Muna access key. You can sign up at [muna.ai/settings/developer](http://muna.ai/settings/developer) and create a key:
```sh
# Muna access key
MUNA_ACCESS_KEY="muna_****"
```

Finally, drop a bunch of PDF's into the project directory and ask your AI agent a question:
```sh
> "What kind of hydraulic fluid should we use in maintenance?"
```

___

## Useful Links
- [Join the Muna community](https://muna.ai/slack).
- [Check out the Muna docs](https://docs.muna.ai).
- [Read the Muna blog](https://muna.ai/blog).
- Reach out to us at [hi@muna.ai](mailto:hi@muna.ai).
