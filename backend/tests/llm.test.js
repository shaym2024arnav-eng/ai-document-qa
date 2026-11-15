const mockCreate = jest.fn();

jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }))
);

const { generateAnswer, DEFAULT_MODEL } = require("../utils/llm");

const sources = [
  { text: "The refund window is 30 days.", score: 0.9 },
  { text: "Shipping takes 5 business days.", score: 0.7 },
];

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ choices: [{ message: { content: "30 days [Source 1]" } }] });
  delete process.env.GROQ_MODEL;
});

test("returns the model's answer", async () => {
  await expect(generateAnswer("Refund window?", sources)).resolves.toBe("30 days [Source 1]");
});

test("numbers each source and includes the question", async () => {
  await generateAnswer("Refund window?", sources);
  const prompt = mockCreate.mock.calls[0][0].messages[0].content;

  expect(prompt).toContain("[Source 1]: The refund window is 30 days.");
  expect(prompt).toContain("[Source 2]: Shipping takes 5 business days.");
  expect(prompt).toContain("Question: Refund window?");
});

test("tells the model to cite sources and refuse when the answer is missing", async () => {
  await generateAnswer("q", sources);
  const prompt = mockCreate.mock.calls[0][0].messages[0].content;

  expect(prompt).toMatch(/cite the source/i);
  expect(prompt).toContain("I couldn't find that in the document.");
  expect(prompt).toMatch(/do not use outside knowledge/i);
});

test("uses the default model, or GROQ_MODEL when set", async () => {
  await generateAnswer("q", sources);
  expect(mockCreate.mock.calls[0][0].model).toBe(DEFAULT_MODEL);
  expect(DEFAULT_MODEL).toBe("openai/gpt-oss-120b");

  process.env.GROQ_MODEL = "some/other-model";
  await generateAnswer("q", sources);
  expect(mockCreate.mock.calls[1][0].model).toBe("some/other-model");
});

test("passes LLM errors up to the caller", async () => {
  mockCreate.mockRejectedValue(new Error("rate limited"));
  await expect(generateAnswer("q", sources)).rejects.toThrow("rate limited");
});