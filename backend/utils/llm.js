const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateAnswer(question, contextChunks) {
  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]: ${chunk.text}`)
    .join("\n\n");

  const prompt = `You are a helpful assistant answering questions based only on the provided document context. If the answer isn't in the context, say you don't know based on the document.

Context:
${context}

Question: ${question}

Answer the question clearly and concisely, based only on the context above.`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
  });

  return completion.choices[0].message.content;
}

module.exports = { generateAnswer };