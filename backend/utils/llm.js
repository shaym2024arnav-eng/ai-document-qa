const Groq = require("groq-sdk");

// Groq retired llama-3.3-70b-versatile in August 2026. The model now comes
// from .env so a future retirement is a one-line config change.
const DEFAULT_MODEL = "openai/gpt-oss-120b";

let groq = null;
const getClient = () => {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
};

async function generateAnswer(question, contextChunks) {
  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]: ${chunk.text}`)
    .join("\n\n");

  const prompt = `You are a helpful assistant answering questions based only on the provided document context. If the answer isn't in the context, say you don't know based on the document.

Context:
${context}

Question: ${question}

Answer the question clearly and concisely, based only on the context above.`;

  const completion = await getClient().chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    temperature: 0.3,
  });

  return completion.choices[0].message.content;
}

module.exports = { generateAnswer, DEFAULT_MODEL };