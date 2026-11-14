const { generateEmbedding, cosineSimilarity } = require("./embeddings");

const TOP_K = 3;

/**
 * Embeds the question and returns the `k` most similar chunks of a
 * document, best first, each with its similarity score.
 */
async function retrieveTopChunks(doc, question, k = TOP_K) {
  const questionEmbedding = await generateEmbedding(question);

  return doc.chunks
    .map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      score: cosineSimilarity(questionEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

module.exports = { retrieveTopChunks, TOP_K };