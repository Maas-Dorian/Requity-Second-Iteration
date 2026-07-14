/**
 * QA harness for the client final match email builder (no network, no DB).
 * Run: npx tsx backend/scripts/qa-client-final-email.ts
 * Verifies subjects, client-direct copy, agent contact links, strengths
 * headings, "Not provided" fallbacks, and that no internal archetype or fit
 * labels ever leak into the client-facing output.
 */
import { buildClientFinalMatchEmail } from "../lib/emailReports.js";
import { extractClientExpectations, normalizeClientExpectations } from "../lib/clientExpectations.js";

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

const ARCHETYPE_LABELS = ["The Collaborator", "The Strategist", "The Navigator", "The Producer", "The Trendsetter"];

// --- 1. Buying-only -----------------------------------------------------
const buying = buildClientFinalMatchEmail({
  clientName: "Jamie Rivera",
  buyingAgent: {
    agentName: "Josh Hunt",
    agentEmail: "josh@example.com",
    agentPhone: "(502) 555-1234",
    agentArchetype: "The Strategist",
  },
  buyingMarket: "Louisville",
});
check("buying subject", buying.subject === "Your REQUITY buying agent match is ready");
check("buying: 'Your match at a glance' present", buying.html.includes("Your match at a glance"));
check("buying: buying agent row", buying.html.includes("Your buying agent"));
check("buying: mailto link", buying.html.includes('href="mailto:josh@example.com"'));
check("buying: tel link", buying.html.includes('href="tel:+15025551234"'));
check("buying: strengths heading", buying.html.includes("This agent\u2019s strengths are"));
check("buying: what happens next", buying.html.includes("What happens next"));
check(
  "buying: no archetype labels",
  !ARCHETYPE_LABELS.some((a) => buying.html.includes(a) || buying.text.includes(a))
);
check(
  "buying: no agent-facing wording",
  !/your client prefers|this client needs|client profile summary/i.test(buying.html)
);
check("buying: plain text has phone", buying.text.includes("(502) 555-1234"));

// --- 2. Two agents (buying and selling) ---------------------------------
const two = buildClientFinalMatchEmail({
  clientName: "Sam Lee",
  buyingAgent: { agentName: "Josh Hunt", agentEmail: "josh@example.com", agentPhone: "5025551234", agentArchetype: "The Producer" },
  sellingAgent: { agentName: "Mike Gandolfo", agentEmail: "mike@example.com", agentPhone: null, agentArchetype: "The Navigator" },
  buyingMarket: "Lexington",
  sellingMarket: "Louisville",
});
check("two-agent subject", two.subject === "Your REQUITY real estate agent matches are ready");
check("two-agent: both glance rows", two.html.includes("Your buying agent") && two.html.includes("Your selling agent"));
check("two-agent: lane strengths headings",
  two.html.includes("Your buying agent\u2019s strengths are") &&
  two.html.includes("Your selling agent\u2019s strengths are"));
check("two-agent: missing phone shows Not provided", two.text.includes("Phone: Not provided"));
check("two-agent: both emails present", two.html.includes("josh@example.com") && two.html.includes("mike@example.com"));
check("two-agent: no archetypes", !ARCHETYPE_LABELS.some((a) => two.html.includes(a)));

// --- 3. One agent covering both -----------------------------------------
const both = buildClientFinalMatchEmail({
  clientName: "Ana",
  bothAgent: { agentName: "Josh Hunt", agentEmail: "josh@example.com", agentPhone: "+1 502 555 1234", agentArchetype: "The Collaborator" },
  buyingMarket: "Tampa",
  sellingMarket: "Tampa",
});
check("both subject", both.subject === "Your REQUITY real estate agent match is ready");
check("both: 'Your real estate agent' row", both.html.includes("Your real estate agent"));
check("both: buying + selling market rows", both.html.includes("Buying market") && both.html.includes("Selling market"));
check("both: single strengths heading", both.html.includes("This agent\u2019s strengths are"));

// --- 4. Same agent on both lanes collapses to one agent ------------------
const collapsed = buildClientFinalMatchEmail({
  clientName: "Ana",
  buyingAgent: { agentName: "Josh Hunt", agentEmail: "josh@example.com", agentPhone: "5025551234" },
  sellingAgent: { agentName: "Josh Hunt", agentEmail: "JOSH@example.com", agentPhone: "5025551234" },
  buyingMarket: "Tampa",
  sellingMarket: "Tampa",
});
check("collapsed subject (one agent)", collapsed.subject === "Your REQUITY real estate agent match is ready");
check("collapsed: no duplicate agent sections", !collapsed.html.includes("Selling agent</h2>"));

// --- 5. Selling-only + everything missing --------------------------------
const selling = buildClientFinalMatchEmail({
  clientName: null,
  sellingAgent: { agentName: null, agentEmail: null, agentPhone: null, agentArchetype: "Unknown Type" },
  sellingMarket: null,
});
check("selling subject", selling.subject === "Your REQUITY selling agent match is ready");
check("selling: Not provided fallbacks", (selling.text.match(/Not provided/g) ?? []).length >= 3);
check("selling: generic strengths (3-5 bullets)", (selling.html.match(/<li /g) ?? []).length >= 3);
check("selling: never prints null/undefined", !/>\s*(null|undefined)\s*</.test(selling.html));

// --- 6. Expectations normalization helper --------------------------------
const fromScalar = extractClientExpectations({ appreciation_style: "dedicated_attention", agent_expectations_notes: "Call me weekly" });
check("extract: scalar columns", fromScalar.appreciationStyle === "dedicated_attention" && fromScalar.agentExpectationsNotes === "Call me weekly");
const fromResult = extractClientExpectations({ result: { appreciationStyle: "uplifting_words", agentExpectationsNotes: "notes" } });
check("extract: result JSON camelCase", fromResult.appreciationStyle === "uplifting_words");
const fromAnswers = extractClientExpectations({ answers: { "17": "memorable_gestures", "18": "Some expectations" } });
check("extract: answers by question id", fromAnswers.appreciationStyle === "memorable_gestures" && fromAnswers.agentExpectationsNotes === "Some expectations");
const fromNested = extractClientExpectations({ assessments: [{ result: { appreciationStyle: "proactive_assistance" } }] });
check("extract: nested assessments rows", fromNested.appreciationStyle === "proactive_assistance");
const normalized = normalizeClientExpectations({});
check("normalize: 'Not answered' fallback", normalized.appreciationStyleLabel === "Not answered" && normalized.appreciationStyle === null);
const normalized2 = normalizeClientExpectations({ appreciation_style: "personalized_celebrations" });
check("normalize: readable label", normalized2.appreciationStyleLabel === "Personalized Celebrations");

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll client final email checks passed.");
