const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");

const { extractTextFromPDF, chunkText } = require("../utils/pdfParser");
const { generateEmbedding } = require("../utils/embeddings");
const { generateAnswer } = require("../utils/llm");
const { retrieveTopChunks } = require("../utils/retrieval");
const { saveDocument, loadDocument, listDocuments } = require("../utils/documentStore");

const router = express.Router();

const MAX_FILE_MB = 10;
const MAX_QUESTION_LENGTH = 1000;
// Less text than this means the PDF is almost certainly scanned images.
const MIN_TEXT_LENGTH = 50;

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);
    cb(isPdf ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"), isPdf);
  },
});

// Wraps multer so its errors become clear 400 responses instead of 500s.
const uploadPdf = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: `File is too large. Maximum size is ${MAX_FILE_MB} MB.` });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Only PDF files are supported." });
    }
    return res.status(400).json({ message: "Upload failed. Please try again." });
  });
};

const readQuestion = (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ message: "Question is required" });
    return null;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ message: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer` });
    return null;
  }
  return question;
};

// POST /api/documents/upload - extract, chunk and embed a PDF
router.post("/upload", uploadPdf, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    let text;
    try {
      text = await extractTextFromPDF(req.file.path);
    } catch {
      return res.status(400).json({ message: "Could not read this PDF. It may be corrupted or password protected." });
    }

    if (text.replace(/\s/g, "").length < MIN_TEXT_LENGTH) {
      return res.status(422).json({
        message: "No readable text found. This looks like a scanned PDF, which isn't supported yet.",
      });
    }

    const chunks = chunkText(text);

    const chunksWithEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      chunksWithEmbeddings.push({ id: i, text: chunks[i], embedding });
    }

    const doc = {
      id: Date.now().toString(),
      filename: req.file.originalname,
      chunks: chunksWithEmbeddings,
    };
    saveDocument(doc);

    return res.status(201).json({
      id: doc.id,
      filename: doc.filename,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Failed to process the document" });
  } finally {
    // Always remove the temporary upload, even when processing fails.
    fs.rmSync(req.file.path, { force: true });
  }
});

// GET /api/documents - list uploaded documents
router.get("/", (req, res) => {
  try {
    return res.json(listDocuments());
  } catch (err) {
    console.error("List error:", err);
    return res.status(500).json({ message: "Failed to list documents" });
  }
});

// POST /api/documents/:id/search - top matching chunks only (no LLM)
router.post("/:id/search", async (req, res) => {
  const question = readQuestion(req, res);
  if (!question) return;

  const doc = loadDocument(req.params.id);
  if (!doc) return res.status(404).json({ message: "Document not found" });

  try {
    const topChunks = await retrieveTopChunks(doc, question);
    return res.json({ topChunks });
  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ message: "Search failed" });
  }
});

// POST /api/documents/:id/ask - retrieve relevant chunks and generate an answer
router.post("/:id/ask", async (req, res) => {
  const question = readQuestion(req, res);
  if (!question) return;

  const doc = loadDocument(req.params.id);
  if (!doc) return res.status(404).json({ message: "Document not found" });

  let sources;
  try {
    sources = await retrieveTopChunks(doc, question);
  } catch (err) {
    console.error("Retrieval error:", err);
    return res.status(500).json({ message: "Search failed" });
  }

  try {
    const answer = await generateAnswer(question, sources);
    return res.json({ answer, sources });
  } catch (err) {
    console.error("LLM error:", err.message);
    return res.status(502).json({ message: "The AI model is unavailable right now. Please try again." });
  }
});

module.exports = router;