const { PDFParse } = require("pdf-parse");
const fs = require("fs");

/**
 * Returns the text of a PDF. pdf-parse v2 adds "-- 1 of 3 --" style page
 * markers between pages; those are removed so they don't end up in chunks.
 */
async function extractTextFromPDF(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text.replace(/^\s*-- \d+ of \d+ --\s*$/gm, "\n");
  } finally {
    await parser.destroy();
  }
}

/**
 * Splits text into chunks of up to `chunkSize` characters without cutting
 * sentences in half. Consecutive chunks share roughly `overlap` characters
 * (whole sentences) so an answer that spans a chunk boundary is still found.
 */
function chunkText(text, chunkSize = 800, overlap = 100) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Split into sentences; keep the punctuation with the sentence.
  let sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [clean];
  sentences = sentences.map((s) => s.trim()).filter(Boolean);

  // A single "sentence" longer than a chunk (tables, lists with no full
  // stops) is split on word boundaries instead.
  const pieces = [];
  for (const sentence of sentences) {
    if (sentence.length <= chunkSize) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(" ")) {
      if (current && (current + " " + word).length > chunkSize) {
        pieces.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks = [];
  let current = [];
  let length = 0;

  for (const piece of pieces) {
    if (length + piece.length + 1 > chunkSize && current.length) {
      chunks.push(current.join(" "));

      // Start the next chunk with the last sentences of this one (overlap).
      const carried = [];
      let carriedLength = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        if (carriedLength + current[i].length > overlap) break;
        carried.unshift(current[i]);
        carriedLength += current[i].length + 1;
      }
      current = carried;
      length = carriedLength;
    }
    current.push(piece);
    length += piece.length + 1;
  }
  if (current.length) chunks.push(current.join(" "));

  return chunks.filter((chunk) => chunk.length > 20);
}

module.exports = { extractTextFromPDF, chunkText };