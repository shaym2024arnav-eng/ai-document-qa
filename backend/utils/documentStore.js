const fs = require("fs");
const path = require("path");

// backend/data is in .gitignore, so it doesn't exist on a fresh clone or
// on Render. Create it on startup instead of crashing on the first upload.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Document ids are timestamps. Checking the format stops a crafted id such
// as "../../package" from reading files outside the data folder.
const isValidId = (id) => /^\d{10,20}$/.test(String(id));

const fileFor = (id) => path.join(DATA_DIR, `${id}.json`);

function saveDocument(doc) {
  fs.writeFileSync(fileFor(doc.id), JSON.stringify(doc));
}

function loadDocument(id) {
  if (!isValidId(id) || !fs.existsSync(fileFor(id))) return null;
  return JSON.parse(fs.readFileSync(fileFor(id), "utf-8"));
}

function listDocuments() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
      return { id: doc.id, filename: doc.filename, chunkCount: doc.chunks.length };
    });
}

module.exports = { DATA_DIR, isValidId, saveDocument, loadDocument, listDocuments };