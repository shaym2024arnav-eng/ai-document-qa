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

    const prompt = `You are a helpful assistant answering questions using only the numbered sources below, which are passages from the user's document.

Rules:
- Use only information from the sources. Do not use outside knowledge.
- After each fact, cite the source it came from, like [Source 1] or [Source 2].
- If the sources do not contain the answer, reply exactly: "I couldn't find that in the document."

Sources:
${context}

Question: ${question}

Answer clearly and concisely.`;

  const completion = await getClient().chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    temperature: 0.3,
  });

  return completion.choices[0].message.content;
}

module.exports = { generateAnswer, DEFAULT_MODEL };