/* QA harness for reviewer/updates.js (Updates tab announcements).
 * Runs the IIFE against a minimal DOM shim + stubbed RequityAPI and asserts
 * list rendering, summary counts, form validation, and preview markup.
 * Usage: node scripts/qa-updates-tab.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

function makeEl(id) {
  return {
    id: id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    className: '',
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle() {},
      contains(c) { return this._set.has(c); }
    },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    scrollIntoView() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; }
  };
}

const ids = [
  'ann-list', 'ann-create-btn', 'ann-form-wrap', 'ann-form-title', 'ann-title', 'ann-body',
  'ann-priority', 'ann-audience', 'ann-targets-wrap', 'ann-target-search', 'ann-target-list',
  'ann-target-count', 'ann-cta-label', 'ann-cta-url', 'ann-starts', 'ann-ends', 'ann-dismissible',
  'ann-preview-wrap', 'ann-preview', 'ann-form-msg', 'ann-save-draft', 'ann-save-publish',
  'ann-preview-btn', 'ann-cancel',
  'ann-count-active', 'ann-count-scheduled', 'ann-count-drafts', 'ann-count-archived'
];
const els = {};
ids.forEach((id) => { els[id] = makeEl(id); });

global.document = {
  getElementById(id) { return els[id] || null; },
  addEventListener() {}
};
global.window = global;

const ANNOUNCEMENTS = [
  {
    id: 'a1', title: 'Platform maintenance Saturday', body: 'Short window.',
    priority: 'maintenance', status: 'active', effectiveStatus: 'active',
    audience: 'all_agents', audienceLabel: 'All agents', ctaLabel: null, ctaUrl: null,
    dismissible: true, startsAt: null, endsAt: null, targetAgentIds: [], dismissedCount: 3,
    updatedAt: '2026-07-10T00:00:00Z'
  },
  {
    id: 'a2', title: 'Update your location', body: 'Please add your market.',
    priority: 'important', status: 'draft', effectiveStatus: 'draft',
    audience: 'selected_agents', audienceLabel: 'Selected agents',
    ctaLabel: 'Open settings', ctaUrl: '/agent/dashboard.html', dismissible: false,
    startsAt: null, endsAt: null, targetAgentIds: ['x1', 'x2'], dismissedCount: 0,
    updatedAt: null
  }
];

let savedPayload = null;
global.RequityAPI = {
  fetchReviewerAnnouncements: () => Promise.resolve({
    announcements: ANNOUNCEMENTS,
    summary: { active: 1, scheduled: 0, drafts: 1, archived: 0 },
    announcementsTableAvailable: true
  }),
  fetchReviewerAgents: () => Promise.resolve({ agents: [
    { id: 'x1', name: 'Agent One', email: 'one@x.com', status: 'active', paymentStatusLabel: 'Paid', marketCity: 'Miami' },
    { id: 'x2', name: 'Agent Two', email: 'two@x.com', status: 'active', paymentStatusLabel: 'Unpaid', missingLocation: true }
  ] }),
  createReviewerAnnouncement: (p) => { savedPayload = p; return Promise.resolve({ ok: true }); },
  updateReviewerAnnouncement: (p) => { savedPayload = p; return Promise.resolve({ ok: true }); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'reviewer', 'updates.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(src);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('PASS ' + name); }
  else { failures += 1; console.error('FAIL ' + name); }
}

(async function run() {
  window.__reviewerLoadUpdates();
  await new Promise((r) => setTimeout(r, 10));

  check('list renders both announcements',
    els['ann-list'].innerHTML.includes('Platform maintenance Saturday') &&
    els['ann-list'].innerHTML.includes('Update your location'));
  check('status pills rendered', els['ann-list'].innerHTML.includes('Active') && els['ann-list'].innerHTML.includes('Draft'));
  check('audience shown', els['ann-list'].innerHTML.includes('Selected agents') && els['ann-list'].innerHTML.includes('2 targeted'));
  check('dismissed count shown', els['ann-list'].innerHTML.includes('3 dismissed'));
  check('summary active card', String(els['ann-count-active'].textContent) === '1');
  check('summary drafts card', String(els['ann-count-drafts'].textContent) === '1');

  // Create form: validation catches missing title.
  els['ann-create-btn'].listeners.click[0]();
  check('form opens', els['ann-form-wrap'].hidden === false);
  els['ann-title'].value = '';
  els['ann-body'].value = 'Body text';
  els['ann-save-draft'].listeners.click[0]();
  await new Promise((r) => setTimeout(r, 5));
  check('missing title blocked', els['ann-form-msg'].textContent === 'A title is required.');

  // Bad CTA URL blocked.
  els['ann-title'].value = 'New platform update';
  els['ann-cta-label'].value = 'View details';
  els['ann-cta-url'].value = 'http://not-https.example.com';
  els['ann-save-draft'].listeners.click[0]();
  await new Promise((r) => setTimeout(r, 5));
  check('non-https CTA blocked', els['ann-form-msg'].textContent.indexOf('CTA URL') !== -1);

  // Valid draft saves.
  els['ann-cta-url'].value = '/agent/dashboard.html';
  els['ann-save-draft'].listeners.click[0]();
  await new Promise((r) => setTimeout(r, 10));
  check('valid draft saved', savedPayload && savedPayload.title === 'New platform update' && savedPayload.publishNow === false);
  check('form closed after save', els['ann-form-wrap'].hidden === true);

  // Preview renders banner markup with title, body, and CTA.
  els['ann-create-btn'].listeners.click[0]();
  els['ann-title'].value = 'Preview me';
  els['ann-body'].value = 'Preview body';
  els['ann-cta-label'].value = 'View details';
  els['ann-cta-url'].value = '/agent/dashboard.html';
  els['ann-preview-btn'].listeners.click[0]();
  check('preview visible', els['ann-preview-wrap'].hidden === false);
  check('preview contains copy',
    els['ann-preview'].innerHTML.includes('Preview me') &&
    els['ann-preview'].innerHTML.includes('Preview body') &&
    els['ann-preview'].innerHTML.includes('View details'));

  // Selected agents audience requires at least one target.
  els['ann-audience'].value = 'selected_agents';
  els['ann-audience'].listeners.change[0]();
  await new Promise((r) => setTimeout(r, 10));
  check('picker loads agents', els['ann-target-list'].innerHTML.includes('Agent One'));
  els['ann-save-publish'].listeners.click[0]();
  await new Promise((r) => setTimeout(r, 5));
  check('selected agents required', els['ann-form-msg'].textContent.indexOf('at least one agent') !== -1);

  process.exit(failures ? 1 : 0);
})();
