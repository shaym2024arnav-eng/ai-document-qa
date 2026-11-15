const fs = require("fs");
const os = require("os");
const path = require("path");

// Point the store at a temporary folder before loading it.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "docstore-test-"));
process.env.DATA_DIR = DATA_DIR;

const { isValidId, saveDocument, loadDocument, listDocuments } = require("../utils/documentStore");

afterAll(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

const doc = (id, filename = "a.pdf") => ({
  id,
  filename,
  chunks: [{ id: 0, text: "hello", embedding: [0.1, 0.2] }],
});

describe("isValidId", () => {
  test("accepts timestamp ids", () => {
    expect(isValidId("1731567890123")).toBe(true);
  });

  test.each([
    ["path traversal", "../../package"],
    ["encoded traversal", "..%2F..%2Fpackage"],
    ["letters", "abc1234567890"],
    ["too short", "123"],
    ["empty", ""],
    ["absolute path", "/etc/passwd"],
  ])("rejects %s", (label, id) => {
    expect(isValidId(id)).toBe(false);
  });
});

describe("save, load and list", () => {
  test("creates the data folder if it is missing", () => {
    expect(fs.existsSync(DATA_DIR)).toBe(true);
  });

  test("saves a document and loads it back", () => {
    saveDocument(doc("1000000000001", "resume.pdf"));
    expect(loadDocument("1000000000001")).toEqual(doc("1000000000001", "resume.pdf"));
  });

  test("returns null for an unknown id", () => {
    expect(loadDocument("1999999999999")).toBeNull();
  });

  test("returns null for an invalid id instead of reading the file system", () => {
    expect(loadDocument("../../package")).toBeNull();
  });

  test("lists documents without their chunks", () => {
    saveDocument(doc("1000000000002", "notes.pdf"));
    const list = listDocuments();

    expect(list).toEqual(
      expect.arrayContaining([
        { id: "1000000000001", filename: "resume.pdf", chunkCount: 1 },
        { id: "1000000000002", filename: "notes.pdf", chunkCount: 1 },
      ])
    );
    list.forEach((item) => expect(item.chunks).toBeUndefined());
  });

  test("ignores files in the data folder that are not documents", () => {
    fs.writeFileSync(path.join(DATA_DIR, ".DS_Store"), "junk");
    expect(() => listDocuments()).not.toThrow();
  });
});