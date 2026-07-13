/**
 * QA harness for the appreciation_style / agent_expectations_notes plumbing:
 *  - formatAppreciationStyle readable labels + safe fallbacks,
 *  - attachClientReport normalization (snake_case, camelCase, result JSON,
 *    legacy expectations columns, and missing fields),
 *  - HTML escaping + line-break preservation in the email builders.
 *
 * Pure logic only (no DB, no network). Usage: npx tsx backend/scripts/qa-client-expectations.ts
 */
import {
  formatAppreciationStyle,
  isApprovedAppreciationStyle,
  attachClientReport,
  APPRECIATION_STYLE_VALUES,
} from "../lib/clientReport.js";
import { buildClientAssessmentEmailReport } from "../lib/emailReports.js";
import { escapeHtmlMultiline } from "../lib/emailTemplate.js";

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

// --- formatAppreciationStyle -------------------------------------------------
check("dedicated_attention -> Dedicated Attention", formatAppreciationStyle("dedicated_attention") === "Dedicated Attention");
check("uplifting_words -> Uplifting Words", formatAppreciationStyle("uplifting_words") === "Uplifting Words");
check("proactive_assistance -> Proactive Assistance", formatAppreciationStyle("proactive_assistance") === "Proactive Assistance");
check("memorable_gestures -> Memorable Gestures", formatAppreciationStyle("memorable_gestures") === "Memorable Gestures");
check("personalized_celebrations -> Personalized Celebrations", formatAppreciationStyle("personalized_celebrations") === "Personalized Celebrations");
check("null -> null", formatAppreciationStyle(null) === null);
check("empty string -> null", formatAppreciationStyle("  ") === null);
check("legacy free text passes through", formatAppreciationStyle("Kind words") === "Kind words");
check("5 approved values", APPRECIATION_STYLE_VALUES.length === 5);
check("isApprovedAppreciationStyle accepts approved", isApprovedAppreciationStyle("memorable_gestures"));
check("isApprovedAppreciationStyle rejects unknown", !isApprovedAppreciationStyle("hugs"));

// --- attachClientReport normalization ----------------------------------------
const snake = attachClientReport({
  archetype: "The Supporter",
  appreciation_style: "dedicated_attention",
  agent_expectations_notes: "Weekly updates please.\nAnd direct guidance.",
});
check("snake_case appreciation raw", snake.report.appreciationStyle === "dedicated_attention");
check("snake_case appreciation label", snake.report.appreciationStyleLabel === "Dedicated Attention");
check(
  "snake_case notes preserved with line break",
  snake.report.agentExpectationsNotes === "Weekly updates please.\nAnd direct guidance."
);

const camel = attachClientReport({
  appreciationStyle: "uplifting_words",
  agentExpectationsNotes: "camel notes",
});
check("camelCase appreciation read", camel.report.appreciationStyleLabel === "Uplifting Words");
check("camelCase notes read", camel.report.agentExpectationsNotes === "camel notes");

const viaResult = attachClientReport({
  result: { appreciationStyle: "memorable_gestures", agentExpectationsNotes: "from json" },
});
check("result JSON appreciation fallback", viaResult.report.appreciationStyleLabel === "Memorable Gestures");
check("result JSON notes fallback", viaResult.report.agentExpectationsNotes === "from json");

const legacy = attachClientReport({ expectations_or_questions: "old column text" });
check("legacy expectations column still read", legacy.report.agentExpectationsNotes === "old column text");

const empty = attachClientReport({ full_name: "Old Client", archetype: "The Supporter" });
check("old record: appreciationStyle null", empty.report.appreciationStyle === null);
check("old record: appreciationStyleLabel null", empty.report.appreciationStyleLabel === null);
check("old record: agentExpectationsNotes null", empty.report.agentExpectationsNotes === null);

// --- escaping + line breaks in email HTML -------------------------------------
const hostile = "I want <script>alert(1)</script> & \"fast\" replies\nLine two";
const escaped = escapeHtmlMultiline(hostile);
check("email escaping removes raw tags", !escaped.includes("<script>"));
check("email escaping keeps entities", escaped.includes("&lt;script&gt;") && escaped.includes("&amp;"));
check("email escaping converts newline to <br>", escaped.includes("<br>"));

const email = buildClientAssessmentEmailReport({
  clientName: "QA Client",
  archetype: "The Supporter",
  transactionIntent: "buying",
  appreciationStyle: "dedicated_attention",
  expectationsOrQuestions: hostile,
});
check("email HTML shows readable label (no snake_case)", email.html.includes("Dedicated Attention") && !email.html.includes("dedicated_attention"));
check("email HTML has the new section heading", email.html.includes("What this client wants from their agent"));
check("email HTML escapes the open-ended answer", !email.html.includes("<script>alert"));
check("email HTML preserves the line break", email.html.includes("Line two") && email.html.includes("<br>"));
check("plain text includes both answers", email.text.includes("Dedicated Attention") && email.text.includes("Line two"));

const emailUnanswered = buildClientAssessmentEmailReport({
  clientName: "QA Old Client",
  archetype: "The Supporter",
});
check("unanswered email shows Not provided", emailUnanswered.html.includes("Not provided"));
check("unanswered plain text shows Not provided", emailUnanswered.text.includes("Not provided"));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll client-expectations checks passed.");
