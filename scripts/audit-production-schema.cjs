/*
 * REQUITY production schema drift audit (READ ONLY).
 *
 * Checks that every table and column the current code depends on exists in the
 * database reachable through SUPABASE_URL + the service role key. Never
 * modifies data, never prints secrets (only env var NAMES and column names).
 *
 * Usage:
 *   node scripts/audit-production-schema.cjs
 *
 * Env (read from process.env, or a local .env file at the repo root):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE)
 *
 * Exit code 0 = no missing tables/columns, 1 = drift found or config missing.
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  console.error('CONFIG MISSING: ' + missing.join(', ') + ' (set env vars or a repo-root .env). No secrets are printed.');
  process.exit(1);
}

const REST_BASE = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';

/**
 * Probe one table (optionally one column) with a zero-row select.
 * Returns { ok, kind } where kind is 'ok' | 'missing_table' | 'missing_column' | 'error'.
 */
async function probe(table, column) {
  const select = column ? encodeURIComponent(column) : '*';
  const url = REST_BASE + table + '?select=' + select + '&limit=1';
  let res;
  try {
    res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        Prefer: 'count=none',
      },
    });
  } catch (err) {
    return { ok: false, kind: 'error', detail: 'network: ' + (err && err.message) };
  }
  if (res.ok) return { ok: true, kind: 'ok' };
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error */ }
  const code = body && body.code;
  const message = (body && body.message) || '';
  // PGRST205 / 42P01: table missing. PGRST204 / 42703: column missing.
  if (code === 'PGRST205' || code === '42P01' || /could not find the table/i.test(message)) {
    return { ok: false, kind: 'missing_table', detail: code || message.slice(0, 120) };
  }
  if (code === 'PGRST204' || code === '42703' || /column .* does not exist|could not find the .* column/i.test(message)) {
    return { ok: false, kind: 'missing_column', detail: code || message.slice(0, 120) };
  }
  return { ok: false, kind: 'error', detail: (code ? code + ' ' : '') + message.slice(0, 160) };
}

/**
 * Areas to audit. Each entry: table, columns the CURRENT code reads/writes,
 * and the migration that provides them.
 */
const CHECKS = [
  {
    area: 'Password reset',
    table: 'auth_password_reset_tokens',
    migration: '0013 / 0016 repair',
    columns: ['id', 'user_id', 'email', 'token_hash', 'expires_at', 'used_at', 'requested_ip', 'user_agent', 'created_at'],
  },
  {
    area: 'Auth lookup',
    table: 'profiles',
    migration: '0001',
    columns: ['id', 'email', 'role'],
  },
  {
    area: 'Email audit trail',
    table: 'email_events',
    migration: '0004 + 0005_email_events_sendgrid / 0016 repair',
    columns: [
      'recipient_email', 'template_key', 'brevo_message_id', 'payload', 'status', 'created_at',
      'event_key', 'event_type', 'provider', 'provider_message_id', 'error_message', 'metadata',
      'retry_count', 'next_attempt_at', 'sent_at', 'updated_at',
    ],
  },
  {
    area: 'Reviewer matches (lane-aware)',
    table: 'match_recommendations',
    migration: '0010 + 0011 / 0016 repair',
    columns: [
      'id', 'client_id', 'agent_id', 'lead_id', 'score', 'reason', 'reviewer_id',
      'status', 'match_lane', 'is_selected', 'finalized_at', 'superseded_at',
      'superseded_by', 'reviewer_notes', 'created_at', 'updated_at',
    ],
  },
  {
    area: 'Agent payments (agents only; code reads entity_type = agent rows)',
    table: 'reviewer_payment_statuses',
    migration: '0012 / 0016 repair',
    columns: ['id', 'entity_type', 'entity_id', 'status', 'amount_cents', 'currency', 'note', 'updated_by', 'created_at', 'updated_at'],
  },
  {
    area: 'Announcements (Updates tab)',
    table: 'reviewer_announcements',
    migration: '0015 / 0016 repair',
    columns: [
      'id', 'title', 'body', 'priority', 'status', 'audience', 'cta_label', 'cta_url',
      'dismissible', 'starts_at', 'ends_at', 'created_by', 'updated_by', 'published_at',
      'archived_at', 'created_at', 'updated_at',
    ],
  },
  {
    area: 'Announcements targets',
    table: 'reviewer_announcement_targets',
    migration: '0015 / 0016 repair',
    columns: ['id', 'announcement_id', 'agent_id', 'created_at'],
  },
  {
    area: 'Announcements dismissals',
    table: 'reviewer_announcement_dismissals',
    migration: '0015 / 0016 repair',
    columns: ['id', 'announcement_id', 'agent_id', 'dismissed_at'],
  },
  {
    area: 'Agents (dashboard, control center, slug, location)',
    table: 'agents',
    migration: '0003/0005/0007/0009/0011/0014 / 0016 repair',
    columns: [
      'id', 'email', 'display_name', 'archetype', 'archetype_completed_at',
      'public_assessment_token', 'public_slug', 'market_city', 'market_state',
      'location_normalized', 'archived_at', 'needs_assessment_update',
      'assessment_update_requested_at', 'reviewer_notes',
    ],
  },
  {
    area: 'Clients (agent dashboard + legacy normalization)',
    table: 'clients',
    migration: '0002/0003/0005/0006/0008/0011',
    columns: [
      'id', 'assigned_agent_id', 'full_name', 'email', 'phone', 'archetype', 'status',
      'source', 'created_at', 'updated_at', 'pipeline_status', 'deal_status', 'close_date',
      'transaction_intent', 'transaction_intent_label', 'market_city',
      'buying_market_city', 'selling_market_city', 'archived_at',
    ],
    // Older optional columns: report but do not fail the audit if absent.
    optional: ['deleted_at'],
  },
  {
    area: 'Assessment leads (legacy history + reviewer queue)',
    table: 'assessment_leads',
    migration: '0001/0002/0003/0005/0008/0011',
    columns: [
      'id', 'agent_id', 'email', 'status', 'archetype', 'created_at',
      'completed_at', 'last_activity_at', 'transaction_intent', 'market_city',
      'buying_market_city', 'selling_market_city', 'pipeline_status', 'archived_at',
    ],
    optional: ['full_name', 'name', 'phone', 'notes'],
  },
];

/** Legacy/duplicate concepts worth reporting (informational only). */
const INFO_TABLES = [
  { table: 'reviewer_agent_payment_statuses', note: 'NOT used by code. If it exists it is drift from an older plan; leave it, do not write to it.' },
];

(async function run() {
  console.log('REQUITY production schema audit (read only)');
  console.log('Target host: ' + new URL(SUPABASE_URL).host + '\n');

  let failures = 0;

  for (const check of CHECKS) {
    const tableProbe = await probe(check.table);
    if (tableProbe.kind === 'missing_table') {
      failures += 1;
      console.log('FAIL  ' + check.table + '  (table missing)');
      console.log('      area: ' + check.area);
      console.log('      run migration: ' + check.migration + '\n');
      continue;
    }
    if (tableProbe.kind === 'error') {
      failures += 1;
      console.log('FAIL  ' + check.table + '  (query error: ' + tableProbe.detail + ')');
      continue;
    }

    const missing = [];
    const missingOptional = [];
    for (const col of check.columns) {
      const r = await probe(check.table, col);
      if (!r.ok) missing.push(col);
    }
    for (const col of check.optional || []) {
      const r = await probe(check.table, col);
      if (!r.ok) missingOptional.push(col);
    }

    if (missing.length) {
      failures += 1;
      console.log('FAIL  ' + check.table);
      console.log('      area: ' + check.area);
      console.log('      missing columns: ' + missing.join(', '));
      console.log('      run migration: ' + check.migration + '\n');
    } else {
      console.log('PASS  ' + check.table + (missingOptional.length
        ? '  (optional columns absent, code tolerates: ' + missingOptional.join(', ') + ')'
        : ''));
    }
  }

  console.log('');
  for (const info of INFO_TABLES) {
    const r = await probe(info.table);
    if (r.kind === 'ok') {
      console.log('INFO  ' + info.table + ' exists. ' + info.note);
    }
  }

  console.log('\nNote: PostgREST cannot report indexes/constraints. To verify the');
  console.log('token_hash unique index and RLS state, run this in the SQL editor:');
  console.log("  select indexname, indexdef from pg_indexes where tablename = 'auth_password_reset_tokens';");
  console.log("  select relname, relrowsecurity from pg_class where relname in ('auth_password_reset_tokens','email_events','reviewer_payment_statuses','reviewer_announcements');");

  if (failures) {
    console.log('\nRESULT: DRIFT FOUND (' + failures + ' failing area(s)).');
    console.log('Apply backend/supabase/migrations/0016_repair_auth_reset_and_schema_drift.sql, then re-run this audit.');
    process.exit(1);
  }
  console.log('\nRESULT: no missing tables or columns. Schema matches current code.');
})();
