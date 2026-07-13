/**
 * QA check for the client assessment question order.
 *
 * FAILS (exit 1) if:
 *  - any question appears after agent_expectations_notes,
 *  - agent_expectations_notes is not the FINAL question,
 *  - appreciation_style is not the SECOND-TO-LAST question,
 *  - the original 16 scored questions are missing, reordered, or renumbered,
 *  - the appreciation question is missing any of its 5 approved options,
 *  - the final question is not an optional textarea.
 *
 * Usage: node scripts/qa-assessment-order.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

const scriptPath = path.join(__dirname, "..", "client", "assessment-script.js");
const src = fs.readFileSync(scriptPath, "utf8");

// Evaluate ONLY the question array literal (the file's DOM logic never runs).
const marker = "const consumerAssessmentQuestions =";
const start = src.indexOf(marker);
if (start === -1) {
  console.error("FAIL  consumerAssessmentQuestions not found in assessment-script.js");
  process.exit(1);
}
const arrayStart = src.indexOf("[", start);
let depth = 0;
let end = -1;
for (let i = arrayStart; i < src.length; i++) {
  const ch = src[i];
  if (ch === "[") depth++;
  else if (ch === "]") {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
if (end === -1) {
  console.error("FAIL  could not parse the question array");
  process.exit(1);
}
const questions = vm.runInNewContext(`(${src.slice(arrayStart, end + 1)})`);

check("question array parses", Array.isArray(questions) && questions.length > 0);
check("total question count is 18", questions.length === 18, `got ${questions.length}`);

// 1. The original 16 scored questions keep their ids in order 1..16.
const scored = questions.filter((q) => !q.field);
check("16 scored questions remain", scored.length === 16, `got ${scored.length}`);
check(
  "scored questions keep original order (ids 1..16)",
  scored.every((q, i) => q.id === i + 1),
  `ids: ${scored.map((q) => q.id).join(",")}`
);
check(
  "scored questions come first (no metadata question in the middle)",
  questions.slice(0, 16).every((q) => !q.field)
);

// 2. appreciation_style is SECOND-TO-LAST.
const secondToLast = questions[questions.length - 2];
check(
  "second-to-last question is appreciation_style",
  secondToLast && secondToLast.field === "appreciation_style",
  `got ${secondToLast && (secondToLast.field || secondToLast.id)}`
);
const expectedStyles = [
  "uplifting_words",
  "proactive_assistance",
  "memorable_gestures",
  "dedicated_attention",
  "personalized_celebrations",
];
const styleValues = ((secondToLast && secondToLast.options) || []).map((o) => o.value);
check(
  "appreciation_style has exactly the 5 approved options in order",
  JSON.stringify(styleValues) === JSON.stringify(expectedStyles),
  `got ${styleValues.join(",")}`
);

// 3. agent_expectations_notes is the ABSOLUTE FINAL question.
const last = questions[questions.length - 1];
check(
  "final question is agent_expectations_notes",
  last && last.field === "agent_expectations_notes",
  `got ${last && (last.field || last.id)}`
);
check("final question is a textarea", last && last.type === "textarea");
check("final question is optional", last && last.optional === true);
check("final question caps at 5000 characters", last && last.maxLength === 5000);

// 4. NOTHING appears after agent_expectations_notes.
const lastIdx = questions.findIndex((q) => q.field === "agent_expectations_notes");
check(
  "no question appears after agent_expectations_notes",
  lastIdx === questions.length - 1,
  `agent_expectations_notes at index ${lastIdx} of ${questions.length}`
);

// 5. The final button reads "Complete Assessment" on the last question and the
//    scored answers map never includes the metadata questions.
check(
  "Complete Assessment label wired for the final question",
  /isFinalQuestion\(index\)\s*\?\s*'Complete Assessment'/.test(src)
);
check(
  "scored answers exclude the metadata questions",
  /function scoredAnswersMap\(\)/.test(src) && /isScoredQuestion\(q\)/.test(src)
);
check(
  "submit sends appreciationStyle and agentExpectationsNotes",
  /appreciationStyle:\s*answerForField\('appreciation_style'\)/.test(src) &&
    /agentExpectationsNotes:\s*answerForField\('agent_expectations_notes'\)/.test(src)
);

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll assessment order checks passed.");
