/* QA harness for reviewer/agents.js (Agent Control Center).
 * Runs the IIFE against a minimal DOM shim + stubbed RequityAPI and asserts
 * list rendering, filtering, summary counts, and drawer detail rendering.
 * Usage: node scripts/qa-agents-tab.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

// --- Minimal DOM shim -------------------------------------------------------
function makeEl(id) {
  return {
    id: id,
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    className: '',
    hidden: false,
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, v) { v ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; },
    setAttribute() {},
    dispatchEvent() {}
  };
}

const els = {};
const ids = [
  'acc-list', 'acc-search', 'acc-filter-payment', 'acc-filter-location',
  'acc-filter-archetype', 'acc-filter-status', 'acc-filter-matches', 'acc-count-line',
  'agent-drawer-overlay', 'agent-drawer-name', 'agent-drawer-sub', 'agent-drawer-body',
  'agent-drawer-tabs', 'agent-drawer-close',
  'acc-count-total', 'acc-count-active', 'acc-count-unpaid',
  'acc-count-noloc', 'acc-count-noarch', 'acc-count-matches'
];
ids.forEach((id) => { els[id] = makeEl(id); });

global.document = {
  getElementById(id) { return els[id] || null; },
  querySelector() { return null; },
  addEventListener() {}
};
global.window = global;

// --- Stubbed API -------------------------------------------------------------
const AGENTS = [
  {
    id: 'a1', name: 'Josh Hunt', email: 'josh@x.com', phone: '555-1111',
    marketCity: 'Lexington', marketState: 'KY', archetype: 'The Producer',
    paymentStatus: 'unpaid', paymentStatusLabel: 'Unpaid', activeMatchCount: 2,
    status: 'active', missingLocation: false, missingArchetype: false,
    needsAssessmentUpdate: false, lastActivityAt: '2026-07-01T00:00:00Z'
  },
  {
    id: 'a2', name: 'Mike Gandolfo', email: 'mike@x.com', phone: null,
    marketCity: null, marketState: null, archetype: null,
    paymentStatus: 'paid', paymentStatusLabel: 'Paid', activeMatchCount: 0,
    status: 'active', missingLocation: true, missingArchetype: true,
    needsAssessmentUpdate: true, lastActivityAt: null
  },
  {
    id: 'a3', name: 'Old Agent', email: 'old@x.com', phone: null,
    marketCity: 'Miami', marketState: 'FL', archetype: 'The Analyst',
    paymentStatus: 'waived', paymentStatusLabel: 'Waived', activeMatchCount: 0,
    status: 'archived', missingLocation: false, missingArchetype: false,
    needsAssessmentUpdate: false, lastActivityAt: '2026-01-01T00:00:00Z'
  }
];

const DETAIL = {
  agent: Object.assign({}, AGENTS[0], {
    serviceAreas: ['Georgetown'], serviceRadiusMiles: 50, latitude: 38.0, longitude: -84.5,
    createdAt: '2025-01-01T00:00:00Z', reviewerNotes: 'note', archetypeCompletedAt: '2025-02-01T00:00:00Z',
    interactionStyle: 'Facilitator', focus: 'Pragmatic', stressResponse: 'Fight',
    perceivedValue: 'Excellence', negotiationStyle: 'Directive', assessmentUpdateRequestedAt: null
  }),
  matches: [
    { matchId: 'm1', clientId: 'c1', leadId: null, clientName: 'MomMom', lane: 'buying',
      laneLabel: 'Buying', market: 'Lexington', status: 'agent_assigned', isActive: true,
      matchedAt: '2026-06-01T00:00:00Z', lastEmailSentAt: '2026-06-02T00:00:00Z' },
    { matchId: 'm2', clientId: 'c2', leadId: null, clientName: 'Past Client', lane: 'selling',
      laneLabel: 'Selling', market: 'Louisville', status: 'superseded', isActive: false,
      matchedAt: '2026-05-01T00:00:00Z', lastEmailSentAt: null }
  ],
  payment: { status: 'unpaid', statusLabel: 'Unpaid', amountCents: 12500, note: 'net 30', updatedAt: '2026-06-20T00:00:00Z' }
};

global.RequityAPI = {
  fetchReviewerAgents: () => Promise.resolve({
    agents: AGENTS,
    summary: { totalAgents: 3, activeAgents: 2, unpaidAgents: 1, missingLocation: 1, missingArchetype: 1, activeMatches: 2 },
    archetypes: ['The Producer', 'The Analyst']
  }),
  fetchReviewerAgentDetail: () => Promise.resolve(DETAIL)
};

// --- Load agents.js ----------------------------------------------------------
const src = fs.readFileSync(path.join(__dirname, '..', 'reviewer', 'agents.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(src);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('PASS ' + name); }
  else { failures += 1; console.error('FAIL ' + name); }
}

(async function run() {
  window.__reviewerLoadAgents();
  await new Promise((r) => setTimeout(r, 10));

  // Default view: status filter = active, so 2 of 3 agents.
  check('count line shows filtered subset', els['acc-count-line'].textContent === 'Showing 2 of 3 agents');
  check('list renders both active agents', els['acc-list'].innerHTML.includes('Josh Hunt') && els['acc-list'].innerHTML.includes('Mike Gandolfo'));
  check('archived agent hidden by default', !els['acc-list'].innerHTML.includes('Old Agent'));
  check('missing location warning pill', els['acc-list'].innerHTML.includes('Missing location'));
  check('missing archetype warning pill', els['acc-list'].innerHTML.includes('Missing archetype'));
  check('update requested pill', els['acc-list'].innerHTML.includes('Update requested'));
  check('payment pill rendered', els['acc-list'].innerHTML.includes('Unpaid') && els['acc-list'].innerHTML.includes('Paid'));
  check('View agent button present', els['acc-list'].innerHTML.includes('View agent'));
  // Real DOM coerces textContent to string; this shim keeps the raw number.
  check('summary card total', String(els['acc-count-total'].textContent) === '3');
  check('summary card unpaid', String(els['acc-count-unpaid'].textContent) === '1');

  // Search filter.
  els['acc-search'].value = 'gandolfo';
  els['acc-search'].listeners.input[0]();
  await new Promise((r) => setTimeout(r, 250));
  check('search by name filters', els['acc-count-line'].textContent === 'Showing 1 of 3 agents');
  check('search keeps match', els['acc-list'].innerHTML.includes('Mike Gandolfo') && !els['acc-list'].innerHTML.includes('Josh Hunt'));

  // Zero results -> empty state with Clear filters.
  els['acc-search'].value = 'zzzz';
  els['acc-search'].listeners.input[0]();
  await new Promise((r) => setTimeout(r, 250));
  check('empty state message', els['acc-list'].innerHTML.includes('No agents match these filters'));
  check('clear filters button', els['acc-list'].innerHTML.includes('Clear filters'));

  // Clear via the row action path.
  els['acc-search'].value = '';
  els['acc-search'].listeners.input[0]();
  await new Promise((r) => setTimeout(r, 250));

  // Payment filter.
  els['acc-filter-payment'].value = 'paid';
  els['acc-filter-payment'].listeners.change[0]();
  check('payment filter', els['acc-list'].innerHTML.includes('Mike Gandolfo') && !els['acc-list'].innerHTML.includes('Josh Hunt'));
  els['acc-filter-payment'].value = '';
  els['acc-filter-payment'].listeners.change[0]();

  // Archived filter shows the archived agent.
  els['acc-filter-status'].value = 'archived';
  els['acc-filter-status'].listeners.change[0]();
  check('archived filter', els['acc-list'].innerHTML.includes('Old Agent') && els['acc-list'].innerHTML.includes('Restore agent') === false);
  els['acc-filter-status'].value = 'active';
  els['acc-filter-status'].listeners.change[0]();

  // Drawer: open summary tab for a1 via the exposed click path.
  // Simulate: find handler by calling the list click listener with a fake event.
  const clickList = els['acc-list'].listeners.click[0];
  clickList({ target: { closest: (sel) => sel === '[data-acc-act]' ? { getAttribute: (k) => k === 'data-acc-act' ? 'view' : 'a1' } : null } });
  await new Promise((r) => setTimeout(r, 10));
  check('drawer overlay opened', !els['agent-drawer-overlay'].classList.contains('hidden'));
  check('drawer name set', els['agent-drawer-name'].textContent === 'Josh Hunt');
  check('drawer summary grid rendered', els['agent-drawer-body'].innerHTML.includes('Lexington, KY') && els['agent-drawer-body'].innerHTML.includes('Georgetown'));

  process.exit(failures ? 1 : 0);
})();
