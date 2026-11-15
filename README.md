# AI Document Q&A Assistant

A full-stack RAG (Retrieval-Augmented Generation) app: upload a PDF, ask questions in plain English, and get answers grounded in the document, with each fact cited to the passage it came from. If the answer isn't in the document, it says so instead of guessing.

![CI](https://github.com/shaym2024arnav-eng/ai-document-qa/actions/workflows/ci.yml/badge.svg)

**Live demo:** _coming soon_

## Evaluation

Measured on a 30-question benchmark over a **fictional** company handbook (`backend/eval/`). Because every fact is made up, the model can't know the answers from training, so the test isolates what retrieval adds. 20 questions are answerable from the handbook; 10 are not, and the correct response to those is a refusal.

| Metric | RAG (this app) | Same model, no RAG |
|---|---|---|
| Retrieval hit rate (correct passage in top 3) | **100%** (20/20) | n/a |
| Accuracy on answerable questions | **100%** (20/20) | 0% (0/20) |
| Hallucinations on unanswerable questions | **0%** (0/10) | 10% (1/10) |

Model: `openai/gpt-oss-120b` via Groq. Every answer is saved in `backend/eval/results.json`.

```bash
cd backend
npm run eval                 # full run (calls Groq)
npm run eval -- --limit 5    # quick check
npm run eval -- --regrade    # re-score saved answers, no API calls
```

**Notes on the results:**

- Without the document, the model mostly refused rather than invented answers. It hallucinated on 1 of 10 unanswerable questions: asked about a shuttle bus to the Hyderabad office, it invented details about how employees commute. With RAG it refused all 10 correctly. The bigger difference is on answerable questions, where RAG goes from 0% to 100%.
- The grader's first version marked some correct answers wrong. The model wrote "Forge Week" with a narrow no-break space, and some refusals ("I'm not aware of…") weren't recognised. Both cases were found by checking answers by hand, fixed, and added as tests.
- This is a small benchmark on one short, clean document. Results on long or messy real-world PDFs will be lower.

## Features

- **Upload a PDF** (max 10 MB) with clear errors for wrong file types, oversized, corrupted or password-protected files
- **Scanned PDF detection**: image-only PDFs are rejected with a clear message instead of silently producing empty answers
- **Sentence-aware chunking** (~800 characters) that never cuts a sentence in half, with whole-sentence overlap between chunks
- **Local embeddings** (`all-MiniLM-L6-v2`, runs on the server; no embedding API needed)
- **Semantic search** with cosine similarity, top 3 passages
- **Cited answers**: each fact references `[Source 1]`, `[Source 2]`…, and the passages are shown with similarity scores
- **Refuses when the answer isn't in the document** ("I couldn't find that in the document.")
- **Security**: document ids are validated so a crafted id can't read files outside the data folder

## Tech stack

- **Frontend:** React 19, Vite, Axios
- **Backend:** Node.js, Express 5, Multer
- **AI:** Groq (`openai/gpt-oss-120b`), `@xenova/transformers` (local embeddings), `pdf-parse` v2
- **Storage:** JSON files with cosine-similarity search
- **Testing:** Jest + Supertest (71 tests), GitHub Actions CI

## How it works

```
PDF ──► extract text ──► sentence-aware chunks ──► embed each chunk ──► save
                                                                         │
question ──► embed ──► cosine similarity vs every chunk ──► top 3 ───────┘
                                                              │
                                                              ▼
                                     LLM: "answer only from these sources, cite them,
                                           or say you couldn't find it"
                                                              │
                                                              ▼
                                               answer + cited source passages
```

## Project structure

```
backend/
  routes/documentRoutes.js   upload, list, search, ask (validation, limits, error handling)
  utils/
    pdfParser.js             text extraction + sentence-aware chunking
    embeddings.js            local embeddings (lazy-loaded) + cosine similarity
    retrieval.js             top-k retrieval
    llm.js                   Groq call, citation prompt, model from .env
    documentStore.js         save/load/list documents, id validation
  eval/                      handbook, 30 questions, grader, runner, results
  tests/                     71 Jest + Supertest tests (in-memory PDFs, mocked LLM)
  app.js                     Express app (exported for tests)
  server.js                  starts the server
frontend/
  src/App.jsx                upload + chat UI
.github/workflows/ci.yml     tests, lint and build on every push
```

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/documents/upload` | Upload a PDF (`file` field). Returns `id`, `filename`, `chunkCount` |
| GET | `/api/documents` | List uploaded documents |
| POST | `/api/documents/:id/search` | `{ "question": "..." }` → top matching passages (no LLM call) |
| POST | `/api/documents/:id/ask` | `{ "question": "..." }` → cited answer + source passages |

Errors: `400` bad input, `404` unknown document, `422` scanned PDF, `502` AI model unavailable.

## Running locally

**Prerequisites:** Node.js 20+ and a free Groq API key from [console.groq.com/keys](https://console.groq.com/keys).

### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
PORT=5000
```

```bash
npm run dev     # http://localhost:5000
npm test        # 71 tests, no API key needed
```

The embedding model (~25 MB) downloads automatically on the first upload.

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env` (see `.env.example`):

```
VITE_API_URL=http://localhost:5000
```

```bash
npm run dev     # http://localhost:5173
```

## Limitations

- Scanned (image-only) PDFs aren't supported yet; adding OCR would fix this.
- Documents are stored as JSON files on disk, which suits a demo. Production would use a vector database (pgvector, Pinecone, etc.).
- Embeddings are computed one chunk at a time, so very large PDFs take a while to upload.

## Author

**Arnav Shyam** · [GitHub](https://github.com/shaym2024arnav-eng) · [LinkedIn](https://linkedin.com/in/arnav-shyam-629820296)