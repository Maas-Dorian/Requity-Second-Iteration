/*
 * REQUITY agent platform access audit (READ ONLY, counts only).
 *
 * Reports how many agents are in each platform access state after migration
 * 0018_agent_platform_access_and_stripe.sql. Prints COUNTS ONLY by default:
 * no agent names, emails, or ids. Run with --secure-dev to additionally list
 * the ids of conflicting records (development troubleshooting only).
 *
 * Usage:
 *   node scripts/audit-agent-access-status.cjs
 *   node scripts/audit-agent-access-status.cjs --secure-dev
 *
 * Env (read from process.env, or a local .env file at the repo root):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE)
 *
 * Exit code 0 = clean, 1 = missing/conflicting statuses or config problems.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// --- Minimal .env loader (never logs values) ---------------------------------
function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();

function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

const SUPABASE_URL = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE');
const SECURE_DEV = process.argv.includes('--secure-dev');

if (!SUPABASE_URL || !SERVICE_KEY) {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  console.error('CONFIG MISSING: ' + missing.join(', ') + ' (set env vars or a repo-root .env). No secrets are printed.');
  process.exit(1);
}

const REST_BASE = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';

async function fetchAllAgents() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      REST_BASE +
      'agents?select=id,access_status,payment_required,grandfathered_at,complimentary_access,stripe_payment_status,archived_at,deleted_at,created_at' +
      `&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && /access_status/.test(text)) {
        console.error('SCHEMA NOT READY: the agents table has no access_status column.');
        console.error('Apply backend/supabase/migrations/0018_agent_platform_access_and_stripe.sql first.');
        process.exit(1);
      }
      console.error('QUERY FAILED: HTTP ' + res.status);
      process.exit(1);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const ALLOWED = new Set(['grandfathered', 'paid', 'complimentary']);
const KNOWN = new Set([
  'grandfathered', 'assessment_required', 'payment_required', 'checkout_started',
  'payment_pending', 'paid', 'complimentary', 'payment_failed', 'refunded', 'suspended',
]);

(async () => {
  const agents = await fetchAllAgents();
  const active = agents.filter((a) => !a.archived_at && !a.deleted_at);

  const counts = {
    total: agents.length,
    active: active.length,
    grandfathered: 0,
    paid: 0,
    complimentary: 0,
    paymentRequired: 0, // any blocked pre-payment state
    missingStatus: 0,
    conflicting: 0,
  };
  const conflicts = [];

  for (const a of agents) {
    const status = a.access_status || null;
    if (!status || !KNOWN.has(status)) {
      counts.missingStatus += 1;
      conflicts.push({ id: a.id, problem: 'missing_or_unknown_status' });
      continue;
    }
    if (status === 'grandfathered') counts.grandfathered += 1;
    else if (status === 'paid') counts.paid += 1;
    else if (status === 'complimentary') counts.complimentary += 1;
    else counts.paymentRequired += 1;

    // Conflicts: contradictory access facts that need reviewer attention.
    if (ALLOWED.has(status) && a.payment_required === true) {
      counts.conflicting += 1;
      conflicts.push({ id: a.id, problem: 'allowed_status_but_payment_required_true' });
    } else if (status === 'grandfathered' && !a.grandfathered_at) {
      counts.conflicting += 1;
      conflicts.push({ id: a.id, problem: 'grandfathered_without_timestamp' });
    } else if (status === 'complimentary' && a.complimentary_access !== true) {
      counts.conflicting += 1;
      conflicts.push({ id: a.id, problem: 'complimentary_status_without_flag' });
    } else if (status === 'paid' && a.stripe_payment_status !== 'paid') {
      counts.conflicting += 1;
      conflicts.push({ id: a.id, problem: 'paid_status_without_stripe_paid' });
    }
  }

  console.log('REQUITY agent platform access audit (counts only)');
  console.log('--------------------------------------------------');
  console.log('Total agents:            ' + counts.total);
  console.log('Active (not archived):   ' + counts.active);
  console.log('Grandfathered:           ' + counts.grandfathered);
  console.log('Paid (Stripe):           ' + counts.paid);
  console.log('Complimentary:           ' + counts.complimentary);
  console.log('Payment required states: ' + counts.paymentRequired);
  console.log('Missing access status:   ' + counts.missingStatus);
  console.log('Conflicting status:      ' + counts.conflicting);

  if (SECURE_DEV && conflicts.length) {
    console.log('\n--secure-dev conflict detail (ids only, never names/emails):');
    for (const c of conflicts) console.log('  ' + c.id + '  ' + c.problem);
  }

  process.exit(counts.missingStatus || counts.conflicting ? 1 : 0);
})().catch((err) => {
  console.error('AUDIT FAILED: ' + (err && err.message ? err.message : 'unknown error'));
  process.exit(1);
});
