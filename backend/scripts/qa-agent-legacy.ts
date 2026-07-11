/**
 * QA harness for agent dashboard legacy record normalization.
 * Validates that old records with null lane/status, re-assigned clients, and
 * lead-only assessments still normalize into visible dashboard records.
 *
 * Usage: npx tsx backend/scripts/qa-agent-legacy.ts
 */
import {
  normalizeAgentLegacyRecords,
  inferLaneFromIntent,
  firstDate,
} from "../lib/agentHistory.js";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// --- Lane inference ----------------------------------------------------------
check("infer buying", inferLaneFromIntent("buying") === "buying");
check("infer selling", inferLaneFromIntent("Selling") === "selling");
check("infer both", inferLaneFromIntent("both") === "both");
check("infer null -> general", inferLaneFromIntent(null) === "general");
check("infer junk -> general", inferLaneFromIntent("relocating") === "general");

// --- Date fallbacks ----------------------------------------------------------
check("firstDate picks first", firstDate(null, "", "2024-01-01T00:00:00Z", "2020") === "2024-01-01T00:00:00Z");
check("firstDate all empty -> null", firstDate(null, undefined, "") === null);

// --- Normalization scenarios ---------------------------------------------------
const assignedClients = [
  { id: "c-live", email: "live@x.com", status: "assigned" },
];

const matchRows = [
  // 1. Superseded match whose client was re-assigned to another agent: must
  //    appear as legacy even with NO lane on the match row (pre-lane record).
  {
    id: "m-old", client_id: "c-old", lead_id: null, match_lane: null,
    status: "superseded", score: 82, created_at: "2025-03-01T00:00:00Z",
    finalized_at: null,
    clients: {
      id: "c-old", full_name: "Old Client", email: "old@x.com",
      status: "assigned", transaction_intent: "selling", archetype: "The Explorer",
      created_at: "2025-02-20T00:00:00Z",
    },
  },
  // 2. Match for the still-assigned client: must be SKIPPED (live card exists).
  {
    id: "m-live", client_id: "c-live", lead_id: null, match_lane: "buying",
    status: "assigned", score: 90, created_at: "2025-06-01T00:00:00Z",
    clients: { id: "c-live", full_name: "Live Client", email: "live@x.com", status: "assigned" },
  },
  // 3. Older duplicate match for the same old client + lane: newest must win.
  {
    id: "m-older-dupe", client_id: "c-old", lead_id: null, match_lane: "selling",
    status: "rejected", score: 60, created_at: "2024-11-01T00:00:00Z",
    clients: {
      id: "c-old", full_name: "Old Client", email: "old@x.com",
      status: "assigned", transaction_intent: "selling",
      created_at: "2024-10-01T00:00:00Z",
    },
  },
  // 4. Deleted client: never resurfaces.
  {
    id: "m-deleted", client_id: "c-del", lead_id: null, match_lane: "buying",
    status: "superseded", created_at: "2025-01-01T00:00:00Z",
    clients: { id: "c-del", full_name: "Deleted", status: "deleted" },
  },
  // 5. Lead-only match with NO status on the lead and no archetype: still
  //    shows, flagged as missing the full assessment.
  {
    id: "m-lead", client_id: null, lead_id: "l-1", match_lane: null,
    status: null, created_at: "2024-08-01T00:00:00Z",
    assessment_leads: {
      id: "l-1", name: "Lead Person", email: "lead@x.com",
      transaction_intent: "buying", archetype: null,
      created_at: "2024-07-30T00:00:00Z",
    },
  },
];

const leadRows = [
  // 6. Completed agent-linked lead never converted to a client.
  {
    id: "l-2", full_name: "QR Lead", email: "qr@x.com", status: "completed",
    transaction_intent: null, archetype: "The Harmonizer",
    completed_at: "2024-05-05T00:00:00Z", created_at: "2024-05-01T00:00:00Z",
  },
  // 7. Lead with the same email as an assigned client: deduped away.
  { id: "l-3", full_name: "Live Client", email: "live@x.com", status: "completed" },
  // 8. Lead with the same email as an already-added match record: deduped away.
  { id: "l-4", full_name: "Lead Person Again", email: "lead@x.com", status: "completed" },
];

const records = normalizeAgentLegacyRecords({ assignedClients, matchRows, leadRows });
const byKeyId = (id: string) =>
  records.find((r) => r.clientId === id || r.leadId === id || r.matchId === id);

check("re-assigned client appears as legacy", Boolean(byKeyId("c-old")));
check("legacy lane inferred from intent (null lane -> selling)", byKeyId("c-old")?.lane === "selling");
check("newest match wins the dedupe", byKeyId("c-old")?.matchId === "m-old");
check("legacy receivedAt falls back to created_at", byKeyId("c-old")?.receivedAt === "2025-03-01T00:00:00Z");
check("still-assigned client is not duplicated", !records.some((r) => r.clientId === "c-live"));
check("deleted client never resurfaces", !records.some((r) => r.clientId === "c-del"));

const leadMatch = byKeyId("l-1");
check("lead-only match with null status appears", Boolean(leadMatch));
check("null status defaults to history", leadMatch?.status === "history");
check("missing archetype -> hasFullAssessment false", leadMatch?.hasFullAssessment === false);
check("lead lane inferred from intent", leadMatch?.lane === "buying");

const qrLead = byKeyId("l-2");
check("completed agent-linked lead appears", Boolean(qrLead));
check("lead receivedAt uses completed_at", qrLead?.receivedAt === "2024-05-05T00:00:00Z");
check("lead with archetype -> hasFullAssessment true", qrLead?.hasFullAssessment === true);
check("lead client shape has a name", qrLead?.client.full_name === "QR Lead");

check("lead matching assigned client email deduped", !records.some((r) => r.leadId === "l-3"));
check("lead matching earlier match email deduped", !records.some((r) => r.leadId === "l-4"));
check("total record count", records.length === 3);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll agent legacy normalization checks passed.");
