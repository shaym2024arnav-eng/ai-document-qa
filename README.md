# AI Document Q&A Assistant

A full-stack RAG (Retrieval-Augmented Generation) application that lets you upload a PDF and ask natural-language questions about its content, with answers grounded in the document and source citations.

## Overview

Instead of manually searching through a document or relying on an LLM's general knowledge (and risking hallucination), this app extracts and chunks the document's text, generates semantic embeddings locally, retrieves the most relevant sections for a given question, and uses an LLM to generate an accurate, context-grounded answer — along with the exact source passages used.

## Features

- Upload any PDF document
- Automatic text extraction and chunking
- Local semantic embeddings (no external embedding API required)
- Semantic search to retrieve the most relevant document sections for a question
- LLM-generated answers grounded in the retrieved context (via Groq)
- Source citations shown alongside each answer, with similarity scores
- Chat-style interface

## Tech Stack

**Frontend**
- React.js (Vite)
- Axios

**Backend**
- Node.js
- Express.js
- `pdf-parse` — PDF text extraction
- `@xenova/transformers` — local embedding generation (all-MiniLM-L6-v2)
- `groq-sdk` — LLM inference (Llama 3.3 70B via Groq)
- File-based vector storage (JSON) with cosine similarity search

## How It Works

1. **Upload** — a PDF is uploaded and its text extracted
2. **Chunk** — the text is split into overlapping chunks for better retrieval accuracy
3. **Embed** — each chunk is converted into a vector embedding locally
4. **Ask** — when a question is asked, it's embedded and compared against all chunk embeddings using cosine similarity
5. **Retrieve** — the top matching chunks are selected as context
6. **Generate** — the question and retrieved context are sent to the LLM, which generates a grounded answer
7. **Cite** — the source chunks used are returned alongside the answer

## Project Structure

```
AI Document QA/
├── backend/
│   ├── routes/
│   │   └── documentRoutes.js   # Upload, search, and ask endpoints
│   ├── utils/
│   │   ├── pdfParser.js        # Text extraction and chunking
│   │   ├── embeddings.js       # Local embedding generation + cosine similarity
│   │   └── llm.js              # Groq LLM integration
│   ├── data/                   # Stored document chunks + embeddings (per document)
│   └── server.js
│
└── frontend/
    └── src/
        ├── App.jsx              # Upload + chat interface
        └── App.css
```

## Getting Started

### Prerequisites
- Node.js and npm installed
- A free Groq API key from [console.groq.com](https://console.groq.com)

### Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:
```
PORT=5000
GROQ_API_KEY=your_groq_api_key_here
```

Start the backend:
```bash
npm run dev
```

The API will run on `http://localhost:5000`.

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The app will run on `http://localhost:5173`.

## API Endpoints

| Method | Endpoint                          | Description                              |
|--------|------------------------------------|--------------------------------------------|
| POST   | `/api/documents/upload`           | Upload a PDF, extract text, chunk, embed  |
| GET    | `/api/documents`                  | List all uploaded documents                |
| POST   | `/api/documents/:id/search`       | Retrieve top matching chunks for a question |
| POST   | `/api/documents/:id/ask`          | Retrieve context + generate an LLM answer  |

## Author

**Arnav Shyam**
[GitHub](https://github.com/shaym2024arnav-eng) · [LinkedIn](https://linkedin.com/in/arnav-shyam-629820296)