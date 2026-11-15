const fs = require("fs");
const os = require("os");
const path = require("path");

// Keep uploaded documents in a temporary folder, not backend/data.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "api-test-"));
process.env.DATA_DIR = DATA_DIR;

// Fake embeddings and LLM: no model download, no Groq calls.
// The fake embedding counts a few keywords, so retrieval still ranks
// chunks that mention "refund" above ones that don't.
jest.mock("../utils/embeddings", () => {
  const actual = jest.requireActual("../utils/embeddings");
  const count = (text, word) => (text.toLowerCase().match(new RegExp(word, "g")) || []).length;
  return {
    ...actual,
    generateEmbedding: jest.fn(async (text) => [
      count(text, "refund") + 0.01,
      count(text, "shipping") + 0.01,
      count(text, "warranty") + 0.01,
    ]),
  };
});
jest.mock("../utils/llm", () => ({ generateAnswer: jest.fn() }));

const request = require("supertest");
const app = require("../app");
const { generateAnswer } = require("../utils/llm");
const { makePdf } = require("./makePdf");

afterAll(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

const policyPdf = makePdf([
  [
    "Our refund policy is simple. The refund window is 30 days from delivery.",
    "Refunds are paid to the original payment method.",
  ],
  ["Shipping takes 5 business days. Express shipping takes 2 days."],
  ["The warranty covers manufacturing defects for one year."],
]);

const upload = (buffer, filename = "policy.pdf", contentType = "application/pdf") =>
  request(app).post("/api/documents/upload").attach("file", buffer, { filename, contentType });

const tempUploadsLeft = () =>
  fs.readdirSync(os.tmpdir()).filter((f) => /^[0-9a-f]{32}$/.test(f)).length;

describe("POST /api/documents/upload", () => {
  test("extracts, chunks and saves a PDF", async () => {
    const res = await upload(policyPdf);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filename: "policy.pdf" });
    expect(res.body.id).toMatch(/^\d+$/);
    expect(res.body.chunkCount).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(DATA_DIR, `${res.body.id}.json`))).toBe(true);
  });

  test("rejects a scanned PDF with no text (422)", async () => {
    const res = await upload(makePdf([[]]), "scan.pdf");
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/scanned PDF/);
  });

  test("rejects a corrupted PDF (400)", async () => {
    const res = await upload(Buffer.from("definitely not a pdf"), "broken.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Could not read this PDF/);
  });

  test("rejects files that are not PDFs (400)", async () => {
    const res = await upload(Buffer.from("hello"), "notes.txt", "text/plain");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Only PDF files are supported.");
  });

  test("rejects files over 10 MB (400)", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await upload(big, "big.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large/);
  });

  test("rejects a request with no file (400)", async () => {
    const res = await request(app).post("/api/documents/upload");
    expect(res.status).toBe(400);
  });

  test("does not leave temporary upload files behind", async () => {
    const before = tempUploadsLeft();
    await upload(policyPdf);
    await upload(makePdf([[]]), "scan.pdf");
    await upload(Buffer.from("junk"), "broken.pdf");
    expect(tempUploadsLeft()).toBe(before);
  });
});

describe("GET /api/documents", () => {
  test("lists uploaded documents without their chunks", async () => {
    const { body: uploaded } = await upload(policyPdf, "listed.pdf");
    const res = await request(app).get("/api/documents");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: uploaded.id, filename: "listed.pdf", chunkCount: uploaded.chunkCount },
      ])
    );
  });
});

describe("asking questions", () => {
  let docId;

  beforeAll(async () => {
    docId = (await upload(policyPdf)).body.id;
  });

  beforeEach(() => {
    generateAnswer.mockReset();
    generateAnswer.mockResolvedValue("The refund window is 30 days [Source 1].");
  });

  test("POST /:id/ask returns the answer and the sources it used", async () => {
    const res = await request(app)
      .post(`/api/documents/${docId}/ask`)
      .send({ question: "What is the refund window?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("The refund window is 30 days [Source 1].");
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.sources[0].text).toMatch(/refund/i);
    expect(res.body.sources[0]).not.toHaveProperty("embedding");
  });

  test("passes the trimmed question and retrieved chunks to the LLM", async () => {
    await request(app)
      .post(`/api/documents/${docId}/ask`)
      .send({ question: "  What is the refund window?  " });

    const [question, chunks] = generateAnswer.mock.calls[0];
    expect(question).toBe("What is the refund window?");
    expect(chunks[0].text).toMatch(/refund/i);
  });

  test("POST /:id/search returns ranked chunks without calling the LLM", async () => {
    const res = await request(app)
      .post(`/api/documents/${docId}/search`)
      .send({ question: "shipping" });

    expect(res.status).toBe(200);
    expect(res.body.topChunks[0].text).toMatch(/shipping/i);
    expect(generateAnswer).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", {}],
    ["empty", { question: "   " }],
    ["not a string", { question: 42 }],
    ["too long", { question: "a".repeat(1001) }],
  ])("rejects a question that is %s (400)", async (label, body) => {
    const res = await request(app).post(`/api/documents/${docId}/ask`).send(body);
    expect(res.status).toBe(400);
    expect(generateAnswer).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown document", async () => {
    const res = await request(app)
      .post("/api/documents/1999999999999/ask")
      .send({ question: "q" });
    expect(res.status).toBe(404);
  });

  test("blocks path traversal in the document id (404)", async () => {
    const res = await request(app)
      .post("/api/documents/..%2F..%2Fpackage/ask")
      .send({ question: "q" });
    expect(res.status).toBe(404);
  });

  test("returns 502 with a friendly message when the LLM fails", async () => {
    generateAnswer.mockRejectedValue(new Error("Groq timeout"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/documents/${docId}/ask`)
      .send({ question: "What is the refund window?" });

    expect(res.status).toBe(502);
    expect(res.body.message).not.toMatch(/Groq timeout/);
    spy.mockRestore();
  });
});

test("GET / reports the backend is running", async () => {
  const res = await request(app).get("/");
  expect(res.status).toBe(200);
});