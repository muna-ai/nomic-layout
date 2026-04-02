# Nomic Layout
*INCOMPLETE*

## Using the Agent Skill
Ask your AI agent natural-language questions about your PDF documents and get precise, cited answers. The skill uses layout detection, OCR, and semantic embeddings to index every text region across your PDFs, then performs vector search to find the most relevant passages.

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

## Using the Web Demo
*INCOMPLETE*