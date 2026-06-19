import { getSupabaseAdmin } from "./supabaseAdmin.js";

/**
 * Resilient Supabase writes that tolerate live-schema drift.
 *
 * WHY THIS EXISTS:
 *   The live database can lag behind backend/supabase/schema.sql because
 *   CREATE TABLE IF NOT EXISTS never adds new columns to an existing table.
 *   When the API writes a column the live table does not have yet, PostgREST
 *   rejects the whole write with:
 *     - PGRST204 "Could not find the 'focus' column of 'agents' in the schema cache"
 *     - 42703    "column \"focus\" of relation \"agents\" does not exist"
 *
 *   These helpers detect that specific failure, drop ONLY the unknown
 *   (non-required) column, and retry. The columns that DO exist still save, so
 *   the core data (archetype, contact, status) always persists even before the
 *   alignment migration is run. Required columns are never dropped — if one of
 *   those is missing we throw a clear DbWriteError so the API can report it.
 *
 *   This is additive and non-destructive: it never invents data and never hides
 *   a genuine database error (constraint, RLS, missing table, etc.).
 */

/** PostgREST/Postgres error codes that indicate an unknown column in the payload. */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

/** PostgREST/Postgres error codes that indicate the table itself is missing. */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

type PgLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
  /** DbWriteError carries the underlying Postgres code here. */
  pgCode?: string | null;
};

/** Structured DB write failure carrying a safe Postgres message + the table area. */
export class DbWriteError extends Error {
  area: string;
  detail: string;
  pgCode: string | null;
  /** HTTP status hint for the API layer (DB write failures map to 500). */
  status = 500;

  constructor(area: string, detail: string, pgCode: string | null = null) {
    super(`Database write to ${area} failed: ${detail}`);
    this.name = "DbWriteError";
    this.area = area;
    this.detail = detail;
    this.pgCode = pgCode;
  }
}

/** Pull the offending column name out of a PostgREST/Postgres "missing column" error. */
export function extractMissingColumn(error: unknown): string | null {
  const e = (error ?? {}) as PgLikeError;
  const text = [e.message, e.details, e.hint].filter(Boolean).join(" ");
  if (!text) return null;
  // PGRST204: Could not find the 'focus' column of 'agents' in the schema cache
  const cacheMatch = text.match(/Could not find the '([^']+)' column/i);
  if (cacheMatch) return cacheMatch[1];
  // 42703: column "focus" of relation "agents" does not exist
  const missingMatch = text.match(
    /column "?([A-Za-z0-9_]+)"?(?: of relation "?[A-Za-z0-9_]+"?)? does not exist/i
  );
  if (missingMatch) return missingMatch[1];
  return null;
}

/** True when an error means a column in the payload is unknown to the live schema. */
export function isMissingColumnError(error: unknown): boolean {
  const e = (error ?? {}) as PgLikeError;
  const code = e.code ?? e.pgCode ?? null;
  if (code && MISSING_COLUMN_CODES.has(code)) return true;
  return extractMissingColumn(error) !== null;
}

/** Pull the missing table name out of a PostgREST/Postgres "missing table" error. */
export function extractMissingTable(error: unknown): string | null {
  const e = (error ?? {}) as PgLikeError;
  const text = [e.message, e.details, e.hint].filter(Boolean).join(" ");
  if (!text) return null;
  // PGRST205: Could not find the table 'public.clients' in the schema cache
  const cacheMatch = text.match(/Could not find the table '([^']+)'/i);
  if (cacheMatch) return cacheMatch[1];
  // 42P01: relation "public.clients" does not exist
  const relMatch = text.match(/relation "?([A-Za-z0-9_.]+)"? does not exist/i);
  if (relMatch) return relMatch[1];
  return null;
}

/**
 * True when an error means the TABLE does not exist on the live schema (vs. a
 * missing column). Callers use this to skip optional/legacy tables gracefully
 * instead of failing the whole operation.
 */
export function isMissingTableError(error: unknown): boolean {
  const e = (error ?? {}) as PgLikeError;
  const code = e.code ?? e.pgCode ?? null;
  if (code && MISSING_TABLE_CODES.has(code)) return true;
  return extractMissingTable(error) !== null;
}

export type SchemaWriteOptions = {
  /** Columns returned by PostgREST after the write (default "*"). */
  select?: string;
  /** Columns that must never be dropped; a missing one throws a clear error. */
  required?: string[];
};

export type SchemaWriteResult<Row> = {
  data: Row;
  /** Columns that were dropped because the live schema does not have them yet. */
  dropped: string[];
};

/**
 * INSERT a row, dropping unknown (non-required) columns and retrying until it
 * succeeds or a real error surfaces. Returns the inserted row + dropped columns.
 */
export async function insertWithSchemaFallback<Row = Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
  options: SchemaWriteOptions = {}
): Promise<SchemaWriteResult<Row>> {
  const supabase = getSupabaseAdmin();
  const select = options.select ?? "*";
  const required = new Set(options.required ?? []);
  const payload: Record<string, unknown> = { ...values };
  const dropped: string[] = [];

  // Bound the loop by the number of columns; each retry removes exactly one.
  const maxAttempts = Object.keys(payload).length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select(select)
      .single();
    if (!error) return { data: data as Row, dropped };

    const column = pruneableColumn(error, payload, required);
    if (column) {
      delete payload[column];
      dropped.push(column);
      continue;
    }
    throw new DbWriteError(`public.${table}`, error.message, (error as PgLikeError).code ?? null);
  }
  throw new DbWriteError(
    `public.${table}`,
    "Could not align the insert with the live schema (no writable columns left).",
    "SCHEMA_FALLBACK_EXHAUSTED"
  );
}

/**
 * UPDATE rows matching `match`, dropping unknown (non-required) columns and
 * retrying. Returns the dropped columns (no row is selected back by default).
 */
export async function updateWithSchemaFallback(
  table: string,
  values: Record<string, unknown>,
  match: { column: string; value: unknown },
  options: { required?: string[] } = {}
): Promise<{ dropped: string[] }> {
  const supabase = getSupabaseAdmin();
  const required = new Set(options.required ?? []);
  const payload: Record<string, unknown> = { ...values };
  const dropped: string[] = [];

  const maxAttempts = Object.keys(payload).length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq(match.column, match.value);
    if (!error) return { dropped };

    const column = pruneableColumn(error, payload, required);
    if (column) {
      delete payload[column];
      dropped.push(column);
      continue;
    }
    throw new DbWriteError(`public.${table}`, error.message, (error as PgLikeError).code ?? null);
  }
  throw new DbWriteError(
    `public.${table}`,
    "Could not align the update with the live schema (no writable columns left).",
    "SCHEMA_FALLBACK_EXHAUSTED"
  );
}

/** Returns a droppable column name when the error is a removable missing-column. */
function pruneableColumn(
  error: unknown,
  payload: Record<string, unknown>,
  required: Set<string>
): string | null {
  if (!isMissingColumnError(error)) return null;
  const column = extractMissingColumn(error);
  if (!column) return null;
  if (!Object.prototype.hasOwnProperty.call(payload, column)) return null;
  if (required.has(column)) return null;
  return column;
}
