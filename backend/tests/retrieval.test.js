jest.mock("../utils/embeddings", () => {
  const actual = jest.requireActual("../utils/embeddings");
  return { ...actual, generateEmbedding: jest.fn() };
});

const { generateEmbedding, cosineSimilarity } = require("../utils/embeddings");
const { retrieveTopChunks, TOP_K } = require("../utils/retrieval");

describe("cosineSimilarity", () => {
  test("is 1 for identical direction, 0 for perpendicular, -1 for opposite", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
});

describe("retrieveTopChunks", () => {
  const doc = {
    chunks: [
      { id: 0, text: "about shipping", embedding: [0, 1, 0] },
      { id: 1, text: "about refunds", embedding: [1, 0, 0] },
      { id: 2, text: "mostly refunds", embedding: [0.9, 0.1, 0] },
      { id: 3, text: "about warranty", embedding: [0, 0, 1] },
      { id: 4, text: "a bit refunds", embedding: [0.5, 0.5, 0] },
    ],
  };

  beforeEach(() => generateEmbedding.mockResolvedValue([1, 0, 0]));

  test("returns the top 3 chunks by default, best first", async () => {
    const results = await retrieveTopChunks(doc, "How do refunds work?");

    expect(TOP_K).toBe(3);
    expect(results.map((r) => r.id)).toEqual([1, 2, 4]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  test("embeds the question once", async () => {
    await retrieveTopChunks(doc, "How do refunds work?");
    expect(generateEmbedding).toHaveBeenCalledWith("How do refunds work?");
  });

  test("returns id, text and score but not the embedding", async () => {
    const [top] = await retrieveTopChunks(doc, "q");
    expect(top).toEqual({ id: 1, text: "about refunds", score: expect.any(Number) });
  });

  test("respects a custom k and short documents", async () => {
    expect(await retrieveTopChunks(doc, "q", 1)).toHaveLength(1);
    expect(await retrieveTopChunks({ chunks: doc.chunks.slice(0, 2) }, "q", 5)).toHaveLength(2);
  });
});