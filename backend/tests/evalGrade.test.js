const { grade, isRefusal, containsAnswer } = require("../eval/grade");
const { withRateLimitRetry } = require("../eval/runEval");

describe("isRefusal", () => {
  test.each([
    "I couldn't find that in the document.",
    "The handbook does not mention the CEO's salary.",
    "This information is not specified in the sources.",
    "I don't have information about Zorvex's revenue.",
    "There is no information about a dress code.",
  ])("detects: %s", (answer) => {
    expect(isRefusal(answer)).toBe(true);
  });

  test("does not treat a real answer as a refusal", () => {
    expect(isRefusal("Employees get 24 days of paid annual leave [Source 1].")).toBe(false);
  });
});

describe("containsAnswer", () => {
  test("matches whole numbers and words only", () => {
    expect(containsAnswer("up to 2 days", ["2"])).toBe(true);
    expect(containsAnswer("24 days", ["2"])).toBe(false);
    expect(containsAnswer("600 days", ["60"])).toBe(false);
    expect(containsAnswer("1,200 rupees", ["1,200"])).toBe(true);
    expect(containsAnswer("It's called Forge Week.", ["forge week"])).toBe(true);
  });
});

describe("grade", () => {
  const answerable = { type: "answerable", accept: ["24"] };
  const unanswerable = { type: "unanswerable" };

  test("answerable: correct answer", () => {
    expect(grade(answerable, "You get 24 days [Source 1].")).toMatchObject({ correct: true, hallucinated: false });
  });

  test("answerable: a refusal is wrong but not a hallucination", () => {
    expect(grade(answerable, "I couldn't find that in the document.")).toMatchObject({
      correct: false,
      refused: true,
      hallucinated: false,
    });
  });

  test("unanswerable: refusing is correct", () => {
    expect(grade(unanswerable, "I couldn't find that in the document.")).toMatchObject({
      correct: true,
      hallucinated: false,
    });
  });

  test("unanswerable: inventing an answer is a hallucination", () => {
    expect(grade(unanswerable, "The CEO earns 1.2 crore a year.")).toMatchObject({
      correct: false,
      hallucinated: true,
    });
  });
});

describe("withRateLimitRetry", () => {
  test("waits and retries on a 429, then returns the result", async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Rate limit reached"), { status: 429 }))
      .mockResolvedValueOnce("ok");
    await expect(withRateLimitRetry(fn, { waitMs: 1, log: () => {} })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry other errors", async () => {
    const fn = jest.fn().mockRejectedValue(Object.assign(new Error("Invalid API Key"), { status: 401 }));
    await expect(withRateLimitRetry(fn, { waitMs: 1, log: () => {} })).rejects.toThrow("Invalid API Key");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});