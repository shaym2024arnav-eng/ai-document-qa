const { generateAnswer } = require("../utils/llm");
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { extractTextFromPDF, chunkText } = require("../utils/pdfParser");
const { generateEmbedding, cosineSimilarity } = require("../utils/embeddings");

const upload = multer({ dest: "uploads/" });

// Upload a PDF, extract, chunk, and embed its text
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const text = await extractTextFromPDF(req.file.path);
    const chunks = chunkText(text);

    console.log(`Generating embeddings for ${chunks.length} chunks...`);

    const chunksWithEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      chunksWithEmbeddings.push({ id: i, text: chunks[i], embedding });
    }

    const docId = Date.now().toString();
    const docData = {
      id: docId,
      filename: req.file.originalname,
      chunks: chunksWithEmbeddings,
    };

    fs.writeFileSync(
      path.join(__dirname, "..", "data", `${docId}.json`),
      JSON.stringify(docData, null, 2)
    );

    fs.unlinkSync(req.file.path);

    res.status(201).json({
      id: docId,
      filename: req.file.originalname,
      chunkCount: chunks.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List all uploaded documents
router.get("/", (req, res) => {
  try {
    const dataDir = path.join(__dirname, "..", "data");
    const files = fs.readdirSync(dataDir);
    const docs = files.map((file) => {
      const content = JSON.parse(
        fs.readFileSync(path.join(dataDir, file), "utf-8")
      );
      return {
        id: content.id,
        filename: content.filename,
        chunkCount: content.chunks.length,
      };
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Search relevant chunks for a question (used later for LLM context)
router.post("/:id/search", async (req, res) => {
  try {
    const { question } = req.body;
    const docPath = path.join(__dirname, "..", "data", `${req.params.id}.json`);

    if (!fs.existsSync(docPath)) {
      return res.status(404).json({ message: "Document not found" });
    }

    const docData = JSON.parse(fs.readFileSync(docPath, "utf-8"));
    const questionEmbedding = await generateEmbedding(question);

    const scoredChunks = docData.chunks.map((chunk) => ({
      text: chunk.text,
      score: cosineSimilarity(questionEmbedding, chunk.embedding),
    }));

    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3);

    res.json({ topChunks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ask a question - retrieves relevant chunks + generates an answer
router.post("/:id/ask", async (req, res) => {
  try {
    const { question } = req.body;
    const docPath = path.join(__dirname, "..", "data", `${req.params.id}.json`);

    if (!fs.existsSync(docPath)) {
      return res.status(404).json({ message: "Document not found" });
    }

    const docData = JSON.parse(fs.readFileSync(docPath, "utf-8"));
    const questionEmbedding = await generateEmbedding(question);

    const scoredChunks = docData.chunks.map((chunk) => ({
      text: chunk.text,
      score: cosineSimilarity(questionEmbedding, chunk.embedding),
    }));

    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3);

    const answer = await generateAnswer(question, topChunks);

    res.json({ answer, sources: topChunks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;