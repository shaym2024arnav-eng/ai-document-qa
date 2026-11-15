/**
 * RAG vs no-RAG evaluation on a fictional company handbook.
 *
 * Because every fact in the handbook is made up, the model cannot know the
 * answers from training. That makes it a fair test of two things:
 *   1. Does retrieval give the model the right facts? (accuracy)
 *   2. Does the model refuse when the answer isn't there? (hallucination)
 *
 * Usage (from backend/):
 *   npm run eval                 # all 30 questions
 *   npm run eval -- --limit 5    # quick check
 *   npm run eval -- --regrade    # re-score saved results, no LLM calls
 *
 * Writes eval/results.json and prints a summary.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const { chunkText } = require("../utils/pdfParser");
const { generateEmbedding } = require("../utils/embeddings");
const { retrieveTopChunks, TOP_K } = require("../utils/retrieval");
const { generateAnswer, DEFAULT_MODEL } = require("../utils/llm");
const { grade } = require("./grade");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const LIMIT = flag("limit", Infinity);
const DELAY_MS = flag("delay", 1000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry on Groq free-tier rate limits (HTTP 429) instead of failing. */
async function withRateLimitRetry(fn, { waitMs = Number(process.env.EVAL_RATE_LIMIT_WAIT_MS || 15000), maxWaits = 5, log = console.log } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err?.status === 429 || /\b429\b|rate limit/i.test(err?.message || "");
      if (!isRateLimit || attempt >= maxWaits) throw err;
      log(`   rate limited, waiting ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
}

// Baseline: the same model and question, with no document context.
let groq = null;
async function askWithoutRag(question) {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    temperature: 0.3,
    messages: [{ role: "user", content: `Answer this question about the company Zorvex Robotics concisely.\n\n${question}` }],
  });
  return completion.choices[0].message.content;
}

function summarize(rows, { chunks }) {
  const answerable = rows.filter((r) => r.type === "answerable");
  const unanswerable = rows.filter((r) => r.type === "unanswerable");
  const pct = (part, whole) => (whole.length ? `${((part / whole.length) * 100).toFixed(1)}%` : "n/a");
  const count = (list, fn) => list.filter(fn).length;

  return {
    questions: rows.length,
    chunks,
    topK: TOP_K,
    retrievalHitRate: pct(count(answerable, (r) => r.retrievalHit), answerable),
    ragAccuracy_answerable: pct(count(answerable, (r) => r.rag.correct), answerable),
    noRagAccuracy_answerable: pct(count(answerable, (r) => r.noRag.correct), answerable),
    ragHallucinationRate_unanswerable: pct(count(unanswerable, (r) => r.rag.hallucinated), unanswerable),
    noRagHallucinationRate_unanswerable: pct(count(unanswerable, (r) => r.noRag.hallucinated), unanswerable),
    ragOverallAccuracy: pct(count(rows, (r) => r.rag.correct), rows),
    noRagOverallAccuracy: pct(count(rows, (r) => r.noRag.correct), rows),
    errors: count(rows, (r) => r.rag.error || r.noRag.error),
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    ranAt: new Date().toISOString(),
  };
}

/**
 * Re-score saved answers in results.json with the current grader, without
 * calling the LLM again. Use after fixing a grading rule.
 */
function regrade() {
  const file = path.join(__dirname, "results.json");
  const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8"));
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

  const rows = saved.rows.map((row) => {
    const item = byId[row.id];
    const rescore = (r) => (r.error ? r : { answer: r.answer, ...grade(item, r.answer) });
    return { ...row, rag: rescore(row.rag), noRag: rescore(row.noRag) };
  });

  const summary = {
    ...summarize(rows, { chunks: saved.summary.chunks }),
    model: saved.summary.model,
    ranAt: saved.summary.ranAt,
    regradedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));

  console.log("Re-graded saved answers (no LLM calls).");
  console.table(summary);
}

async function main() {
  const handbook = fs.readFileSync(path.join(__dirname, "handbook.txt"), "utf-8");
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8")).slice(0, LIMIT);

  // Index the handbook exactly like an uploaded PDF: same chunker, same embeddings.
  console.log("Embedding the handbook (the model downloads on first run)...");
  const chunks = chunkText(handbook);
  const doc = { chunks: [] };
  for (let i = 0; i < chunks.length; i++) {
    doc.chunks.push({ id: i, text: chunks[i], embedding: await generateEmbedding(chunks[i]) });
  }
  console.log(`${chunks.length} chunks. Running ${questions.length} questions...\n`);

  const rows = [];

  for (const item of questions) {
    const row = { id: item.id, type: item.type, question: item.question };

    const sources = await retrieveTopChunks(doc, item.question);
    if (item.type === "answerable") {
      row.retrievalHit = sources.some((s) => s.text.includes(item.gold));
    }

    try {
      const answer = await withRateLimitRetry(() => generateAnswer(item.question, sources));
      row.rag = { answer, ...grade(item, answer) };
    } catch (err) {
      row.rag = { error: err.message, correct: false };
    }

    try {
      const answer = await withRateLimitRetry(() => askWithoutRag(item.question));
      row.noRag = { answer, ...grade(item, answer) };
    } catch (err) {
      row.noRag = { error: err.message, correct: false };
    }

    rows.push(row);

    const mark = (r) => (r.error ? "ERR" : r.correct ? "ok " : "X  ");
    console.log(
      `#${String(item.id).padStart(2)} ${item.type.padEnd(12)} RAG ${mark(row.rag)}  no-RAG ${mark(row.noRag)}` +
        (row.retrievalHit === false ? "  (retrieval missed)" : "")
    );

    await sleep(DELAY_MS);
  }

  const summary = summarize(rows, { chunks: chunks.length });

  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ summary, rows }, null, 2));

  console.log("\nSummary");
  console.table(summary);
  console.log("Full results (every answer) written to eval/results.json");
}

if (require.main === module && args.includes("--regrade")) {
  regrade();
} else if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { withRateLimitRetry, summarize };