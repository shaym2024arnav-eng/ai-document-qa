/**
 * Grading rules for the RAG eval.
 *
 * - A refusal is any answer saying the information isn't available.
 * - Answerable question: correct if it contains an accepted answer and
 *   is not a refusal.
 * - Unanswerable question: correct only if it refuses. Anything else is
 *   counted as a hallucination (the model invented an answer).
 */
const REFUSAL_PATTERNS = [
  /couldn['’]?t find/i,
  /could not find/i,
  /can(?:no|['’])t find/i,
  /not (?:mentioned|specified|stated|included|provided|available|covered|found)/i,
  /(?:does|do) not (?:mention|specify|state|include|provide|say|contain)/i,
  /doesn['’]t (?:mention|specify|state|include|provide|say|contain)/i,
  /no (?:information|details|mention|data)/i,
  /(?:don['’]t|do not) (?:know|have)/i,
  /unable to (?:find|determine|answer)/i,
  /cannot (?:determine|answer|be determined)/i,
  /not (?:able|possible) to (?:determine|answer)/i,
];

const isRefusal = (answer) => REFUSAL_PATTERNS.some((re) => re.test(String(answer || "")));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word match so "2" doesn't match "24" and "60" doesn't match "600".
const containsAnswer = (answer, accept) =>
  accept.some((a) => new RegExp(`(^|[^\\w])${escapeRegex(a)}($|[^\\w])`, "i").test(String(answer || "")));

function grade(item, answer) {
  const refused = isRefusal(answer);

  if (item.type === "unanswerable") {
    return { correct: refused, refused, hallucinated: !refused };
  }

  return {
    correct: !refused && containsAnswer(answer, item.accept),
    refused,
    hallucinated: false,
  };
}

module.exports = { grade, isRefusal, containsAnswer };