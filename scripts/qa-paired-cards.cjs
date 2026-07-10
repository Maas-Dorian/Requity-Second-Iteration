// QA harness for the reviewer Paired Clients card logic. Extracts the pure
// display functions from reviewer/script.js (no DOM needed) and runs the
// lane-mapping / blurb / transaction-team scenarios from the redesign spec.
// Run: node scripts/qa-paired-cards.cjs
"use strict";

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "reviewer", "script.js"), "utf8");

// Extract from fmtPairedDate through the end of pairedGroupCardHtml.
const start = src.indexOf("function fmtPairedDate");
const endMarker = "// Active (non-closed) pairings render in Paired Clients";
const end = src.indexOf(endMarker);
if (start === -1 || end === -1) {
  console.error("FAIL: could not locate paired card functions in reviewer/script.js");
  process.exit(1);
}
const block = src.slice(start, end);

// Stubs for closure dependencies outside the extracted block.
const prelude = `
function esc(s) { return String(s == null ? '' : s); }
function cityOrNull(v) { return (v && String(v).trim()) ? String(v).trim() : null; }
var LANE_LABELS = { buying: 'Buying', selling: 'Selling', both: 'Both', general: 'General' };
function transactionText(c) { return (c && (c.transaction_intent_label || c.transaction_intent)) || 'Not specified'; }
function statusSelectHtml() { return '<select class="status-select"></select>'; }
`;

const api = new Function(prelude + block + `
return {
  displayLanesForGroup: displayLanesForGroup,
  groupPairedRows: groupPairedRows,
  buildMatchBlurb: buildMatchBlurb,
  pairedDistanceLabel: pairedDistanceLabel,
  agentsInvolvedLine: agentsInvolvedLine,
  transactionTeamHtml: transactionTeamHtml,
  pairedGroupCardHtml: pairedGroupCardHtml,
  pairedHeaderContact: pairedHeaderContact
};
`)();

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("PASS  " + name);
  else { failures++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

function row(over) {
  return Object.assign({
    matchId: "m1", clientId: "c1", leadId: null, matchLane: "buying",
    matchLaneLabel: "Buying", clientName: "MomMom", clientEmail: "mom@x.com",
    clientArchetype: "The Supporter", transactionIntent: "both",
    transactionIntentLabel: null, buyingMarket: "Lexington", sellingMarket: "Louisville",
    market: null, agentId: "a1", agentName: "Josh Hunt", agentEmail: "josh@x.com",
    agentPhone: null, agentArchetype: "The Collaborator", score: 88, label: "Strong",
    status: "active", pipelineStatus: "active", pipelineLabel: "Active",
    matchedAt: "2026-07-01", agentHasLocation: true, lastEmailAt: "2026-07-02",
    distanceMiles: 12, distanceLabel: "12 mi from buying market", marketLabel: "Lexington",
    agentPaymentStatus: "unpaid", agentPaymentLabel: "Unpaid"
  }, over);
}

// 1. Buying-only client, one buying match.
{
  const g = api.groupPairedRows([row({ transactionIntent: "buying" })])[0];
  const lanes = api.displayLanesForGroup(g);
  check("1a buying-only shows one buying row", lanes.length === 1 && lanes[0].lane === "buying" && lanes[0].kind === "match");
  check("1b distance label", api.pairedDistanceLabel(lanes[0].row, "buying") === "12 mi from buying market");
  const blurb = api.buildMatchBlurb(lanes[0].row, "buying");
  check("1c blurb mentions market + style", /Lexington/.test(blurb) && /collaborator/.test(blurb), blurb);
  const html = api.pairedGroupCardHtml(g);
  check("1d Change buying button", html.indexOf("Change buying") !== -1);
}

// 2. Selling-only client with a legacy GENERAL match row.
{
  const g = api.groupPairedRows([row({
    transactionIntent: "selling", matchLane: "general", matchLaneLabel: "General",
    buyingMarket: null, sellingMarket: "Louisville", distanceMiles: 38,
    agentName: "Mike Gandolfo", agentId: "a2", agentArchetype: "The Trendsetter"
  })])[0];
  const lanes = api.displayLanesForGroup(g);
  check("2a selling-only legacy general shows as Selling", lanes.length === 1 && lanes[0].lane === "selling");
  check("2b distance is lane-specific", api.pairedDistanceLabel(lanes[0].row, "selling") === "38 mi from selling market");
  const html = api.pairedGroupCardHtml(g);
  check("2c Change selling button with data-cm-lane=selling", html.indexOf('data-cm-lane="selling"') !== -1 && html.indexOf("Change selling") !== -1);
}

// 3. Both client, two different agents.
{
  const buyingRow = row({});
  const sellingRow = row({
    matchId: "m2", matchLane: "selling", matchLaneLabel: "Selling", agentId: "a2",
    agentName: "Mike Gandolfo", agentArchetype: "The Trendsetter", distanceMiles: 38,
    agentPaymentStatus: "paid", agentPaymentLabel: "Paid"
  });
  const g = api.groupPairedRows([buyingRow, sellingRow])[0];
  const lanes = api.displayLanesForGroup(g);
  check("3a two rows: buying then selling", lanes.length === 2 && lanes[0].lane === "buying" && lanes[1].lane === "selling");
  const agentsLine = api.agentsInvolvedLine(lanes);
  check("3b agents line names both", /Josh Hunt for buying/.test(agentsLine) && /Mike Gandolfo for selling/.test(agentsLine), agentsLine);
  const team = api.transactionTeamHtml(lanes);
  check("3c team names both with distance + payment", /Buying agent:.*Josh Hunt.*12 mi.*Unpaid/.test(team) && /Selling agent:.*Mike Gandolfo.*38 mi.*Paid/.test(team), team);
  const html = api.pairedGroupCardHtml(g);
  check("3d both change buttons present", html.indexOf("Change buying") !== -1 && html.indexOf("Change selling") !== -1);
  check("3e header shows both markets", /Buying: Lexington/.test(html) && /Selling: Louisville/.test(html));
  check("3f paid agent shows Change payment, unpaid shows Mark agent paid", html.indexOf("Mark agent paid") !== -1 && html.indexOf("Change payment") !== -1);
}

// 4. Both client, ONE agent covering both (both lane).
{
  const g = api.groupPairedRows([row({ matchLane: "both", matchLaneLabel: "Buying and Selling" })])[0];
  const lanes = api.displayLanesForGroup(g);
  check("4a single both-one-agent row", lanes.length === 1 && lanes[0].lane === "both");
  const agentsLine = api.agentsInvolvedLine(lanes);
  check("4b agent involved for buying and selling", agentsLine === "Agent involved: Josh Hunt for buying and selling", agentsLine);
  const team = api.transactionTeamHtml(lanes);
  check("4c team says buying and selling agent", /Buying and selling agent:.*Josh Hunt/.test(team), team);
}

// 4b. Both client, legacy GENERAL match covering both.
{
  const g = api.groupPairedRows([row({ matchLane: "general", matchLaneLabel: "General" })])[0];
  const lanes = api.displayLanesForGroup(g);
  check("4d legacy general for both-intent shows as Both, one agent", lanes.length === 1 && lanes[0].lane === "both");
}

// 5. Both client, only buying matched.
{
  const g = api.groupPairedRows([row({})])[0];
  const lanes = api.displayLanesForGroup(g);
  check("5a buying match + selling needs", lanes.length === 2 && lanes[0].kind === "match" && lanes[1].kind === "needs" && lanes[1].lane === "selling");
  const html = api.pairedGroupCardHtml(g);
  check("5b Match selling button targets selling lane", html.indexOf('data-desk-lane="selling"') !== -1 && html.indexOf("Match selling") !== -1);
  const agentsLine = api.agentsInvolvedLine(lanes);
  check("5c agents line flags selling needs match", /Selling: needs match/.test(agentsLine), agentsLine);
  const team = api.transactionTeamHtml(lanes);
  check("5d team shows Selling agent: Needs match", /Selling agent: Needs match/.test(team), team);
}

// 6. Unknown-intent client with a true general match.
{
  const g = api.groupPairedRows([row({ transactionIntent: null, matchLane: "general", matchLaneLabel: "General", buyingMarket: null, sellingMarket: null, market: "Cincinnati" })])[0];
  const lanes = api.displayLanesForGroup(g);
  check("6a stays General, clearly labeled", lanes.length === 1 && lanes[0].lane === "general");
  const html = api.pairedGroupCardHtml(g);
  check("6b labeled General match", html.indexOf("General match") !== -1);
}

// 7. Distance unavailable is honest, never blank.
{
  const p = row({ distanceMiles: null, distanceLabel: "Distance unavailable" });
  check("7a distance unavailable copy", api.pairedDistanceLabel(p, "buying") === "Distance unavailable");
}

// 8. Weak fit gets the fit note.
{
  const p = row({ score: 40 });
  const blurb = api.buildMatchBlurb(p, "buying");
  check("8a limited fit note", /Fit note: This is a limited fit/.test(blurb), blurb);
  const p2 = row({ agentHasLocation: false });
  check("8b missing agent location => fit note", /Fit note/.test(api.buildMatchBlurb(p2, "buying")));
}

// 9. Same agent on both lanes collapses the agents line.
{
  const g = api.groupPairedRows([
    row({}),
    row({ matchId: "m2", matchLane: "selling", matchLaneLabel: "Selling", distanceMiles: 38 })
  ])[0];
  const lanes = api.displayLanesForGroup(g);
  const agentsLine = api.agentsInvolvedLine(lanes);
  check("9a same agent both lanes", agentsLine === "Agent involved: Josh Hunt for buying and selling", agentsLine);
}

// 10. Blurb stays reasonably short.
{
  const blurb = api.buildMatchBlurb(row({}), "buying");
  check("10a blurb under 170 chars", blurb.length <= 170, String(blurb.length));
}

console.log(failures ? "\n" + failures + " FAILURES" : "\nAll paired card QA checks passed.");
process.exit(failures ? 1 : 0);
