const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractTextFromPDF, chunkText } = require("../utils/pdfParser");
const { makePdf } = require("./makePdf");

describe("chunkText", () => {
  const sentence = (i) => `Sentence ${i} says the refund window is thirty days for item ${i}.`;
  const longText = Array.from({ length: 60 }, (_, i) => sentence(i)).join(" ");

  test("returns an empty list for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  test("keeps a short text as one chunk", () => {
    expect(chunkText("The refund window is 30 days. Contact support to start one.")).toEqual([
      "The refund window is 30 days. Contact support to start one.",
    ]);
  });

  test("never exceeds the chunk size", () => {
    const chunks = chunkText(longText, 300, 60);
    expect(chunks.length).toBeGreaterThan(5);
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(300));
  });

  test("never cuts a sentence in half", () => {
    chunkText(longText, 300, 60).forEach((chunk) => {
      expect(chunk).toMatch(/^Sentence \d+/);
      expect(chunk).toMatch(/\.$/);
    });
  });

  test("overlaps consecutive chunks by whole sentences", () => {
    const chunks = chunkText(longText, 300, 80);
    for (let i = 1; i < chunks.length; i++) {
      const lastSentenceOfPrevious = chunks[i - 1].match(/Sentence \d+[^.]*\./g).pop();
      expect(chunks[i].startsWith(lastSentenceOfPrevious)).toBe(true);
    }
  });

  test("covers every sentence of the original text", () => {
    const joined = chunkText(longText, 300, 60).join(" ");
    for (let i = 0; i < 60; i++) expect(joined).toContain(sentence(i));
  });

  test("splits text with no full stops on word boundaries", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, 200, 0);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(200);
      chunk.split(" ").forEach((w) => expect(w).toMatch(/^word\d+$/));
    });
  });

  test("collapses messy whitespace from PDF extraction", () => {
    expect(chunkText("Line one of the PDF\n\n   continues   here.  ")).toEqual([
      "Line one of the PDF continues here.",
    ]);
  });
});

describe("extractTextFromPDF", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-test-"));
  const write = (name, buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, buffer);
    return file;
  };

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("extracts text from every page and drops page markers", async () => {
    const file = write("text.pdf", makePdf([["The refund window is 30 days."], ["Shipping takes 5 days."]]));
    const text = await extractTextFromPDF(file);

    expect(text).toContain("The refund window is 30 days.");
    expect(text).toContain("Shipping takes 5 days.");
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });

  test("returns no real text for an image-only page", async () => {
    const file = write("scanned.pdf", makePdf([[]]));
    const text = await extractTextFromPDF(file);
    expect(text.replace(/\s/g, "")).toBe("");
  });

  test("rejects a file that is not a PDF", async () => {
    const file = write("fake.pdf", Buffer.from("this is not a pdf at all"));
    await expect(extractTextFromPDF(file)).rejects.toThrow();
  });
});