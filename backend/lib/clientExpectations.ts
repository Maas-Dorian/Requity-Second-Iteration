import { getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  formatAppreciationStyle,
  isApprovedAppreciationStyle,
} from "./clientReport.js";

/**
 * Shared normalization + enrichment for the two final client assessment
 * questions (Appreciation Style and open-ended agent expectations).
 *
 * Root cause this module fixes: on a live database where migration 0017 has
 * not been applied, the scalar columns appreciation_style /
 * agent_expectations_notes do not exist on clients / assessment_leads, so the
 * resilient schema-fallback writers silently DROP those values from the row
 * writes. The data still survives inside the durable `assessments.result`
 * JSON (and the raw answers), but every downstream consumer (reviewer queue,
 * Match Desk, paired clients, agent dashboard, email builders) reads the
 * scalar columns and sees null.
 *
 * This module makes every read path resilient:
 *   1. extractClientExpectations() looks through EVERY historical field name
 *      and nested JSON path used by this repo (snake_case, camelCase, the
 *      result JSON embed, raw answers, lead partial_answers, and nested
 *      assessments rows).
 *   2. enrichRowsWithClientExpectations() batch-backfills rows that are still
 *      missing values by reading the durable assessments rows, then writes
 *      the values onto the row's snake_case fields so all existing consumers
 *      (attachClientReport, formatAppreciationStyle(row.appreciation_style),
 *      email inputs) work unchanged.
 *
 * Never throws: any lookup failure leaves the rows untouched.
 */

export type ClientExpectations = {
  appreciationStyle: string | null;
  /** Readable label, e.g. "Dedicated Attention"; "Not answered" when absent. */
  appreciationStyleLabel: string;
  agentExpectationsNotes: string | null;
};

const DEBUG = process.env.NODE_ENV !== "production";

function cleanStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/** Read appreciation/expectations candidates from one plain object (non-recursive). */
function readDirect(obj: Record<string, any> | null | undefined): {
  appreciationStyle: string | null;
  agentExpectationsNotes: string | null;
} {
  if (!obj || typeof obj !== "object") {
    return { appreciationStyle: null, agentExpectationsNotes: null };
  }
  const appreciationStyle =
    cleanStr(obj.appreciation_style) ?? cleanStr(obj.appreciationStyle) ?? null;
  const agentExpectationsNotes =
    cleanStr(obj.agent_expectations_notes) ??
    cleanStr(obj.agentExpectationsNotes) ??
    cleanStr(obj.expectations_or_questions) ??
    cleanStr(obj.expectationsOrQuestions) ??
    null;
  return { appreciationStyle, agentExpectationsNotes };
}

/**
 * Last-resort read from a raw answers map (answers are keyed by question id in
 * this repo: 17 = appreciation_style, 18 = agent_expectations_notes). Values
 * are only accepted when they look correct (an approved appreciation value /
 * free text), so a re-numbered question can never inject wrong data.
 */
function readFromAnswers(answers: Record<string, any> | null | undefined): {
  appreciationStyle: string | null;
  agentExpectationsNotes: string | null;
} {
  const direct = readDirect(answers);
  let appreciationStyle = direct.appreciationStyle;
  let agentExpectationsNotes = direct.agentExpectationsNotes;
  if (answers && typeof answers === "object") {
    if (!appreciationStyle) {
      const byId = cleanStr((answers as any)["17"]);
      if (byId && isApprovedAppreciationStyle(byId)) appreciationStyle = byId;
    }
    if (!agentExpectationsNotes) {
      const byId = cleanStr((answers as any)["18"]);
      if (byId && !isApprovedAppreciationStyle(byId)) agentExpectationsNotes = byId;
    }
  }
  return { appreciationStyle, agentExpectationsNotes };
}

/**
 * Extract the appreciation style + expectations notes from a client, lead, or
 * assessment row, checking every storage shape this repo has used:
 *   - scalar columns (snake_case) and camelCase aliases,
 *   - the assessment `result` JSON embed,
 *   - raw `answers` / lead `partial_answers` maps,
 *   - `assessment_data` / `assessmentData` / `responses` containers,
 *   - nested `assessments` rows (clients selected with `assessments(*)`).
 * Pure and synchronous; returns nulls when genuinely absent.
 */
export function extractClientExpectations(row: Record<string, any> | null | undefined): {
  appreciationStyle: string | null;
  agentExpectationsNotes: string | null;
} {
  let appreciationStyle: string | null = null;
  let agentExpectationsNotes: string | null = null;

  const merge = (candidate: {
    appreciationStyle: string | null;
    agentExpectationsNotes: string | null;
  }) => {
    if (!appreciationStyle && candidate.appreciationStyle) {
      appreciationStyle = candidate.appreciationStyle;
    }
    if (!agentExpectationsNotes && candidate.agentExpectationsNotes) {
      agentExpectationsNotes = candidate.agentExpectationsNotes;
    }
  };

  if (row && typeof row === "object") {
    merge(readDirect(row));
    merge(readDirect(row.result));
    merge(readDirect(row.assessment_data));
    merge(readDirect(row.assessmentData));
    merge(readDirect(row.responses));
    merge(readFromAnswers(row.answers));
    merge(readFromAnswers(row.partial_answers));

    // Nested assessments (clients rows selected with `assessments(*)`).
    const nested = Array.isArray(row.assessments)
      ? row.assessments
      : row.assessments && typeof row.assessments === "object"
        ? [row.assessments]
        : [];
    for (const a of nested) {
      if (appreciationStyle && agentExpectationsNotes) break;
      merge(readDirect(a));
      merge(readDirect(a?.result));
      merge(readFromAnswers(a?.answers));
    }
  }

  return { appreciationStyle, agentExpectationsNotes };
}

/**
 * Normalized shape for API payloads and UI consumers. The label always has a
 * readable value ("Not answered" fallback), never blank/undefined/null.
 */
export function normalizeClientExpectations(
  row: Record<string, any> | null | undefined
): ClientExpectations {
  const { appreciationStyle, agentExpectationsNotes } = extractClientExpectations(row);
  return {
    appreciationStyle,
    appreciationStyleLabel: formatAppreciationStyle(appreciationStyle) ?? "Not answered",
    agentExpectationsNotes,
  };
}

/**
 * Fill a row's scalar appreciation_style / agent_expectations_notes fields in
 * place from whatever storage shape the row already carries. Returns the same
 * row so it can be used inline. Never overwrites an existing value.
 */
export function applyClientExpectations<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const found = extractClientExpectations(row);
  if (!cleanStr(row.appreciation_style) && found.appreciationStyle) {
    (row as any).appreciation_style = found.appreciationStyle;
  }
  if (!cleanStr(row.agent_expectations_notes) && found.agentExpectationsNotes) {
    (row as any).agent_expectations_notes = found.agentExpectationsNotes;
  }
  return row;
}

/** True when the row still has no appreciation style AND no expectations text. */
function stillMissing(row: Record<string, any>): boolean {
  return !cleanStr(row.appreciation_style) && !cleanStr(row.agent_expectations_notes);
}

/**
 * Batch enrichment for client rows ("kind: client", joined by
 * assessments.client_id = row.id) or assessment_leads rows ("kind: lead",
 * joined by assessments.id = row.client_assessment_id).
 *
 * Two phases:
 *   1. Synchronous extraction from data already on the rows (free).
 *   2. One bounded query against the durable assessments rows for whatever is
 *      still missing, reading the scalar columns AND the result/answers JSON.
 * Mutates the rows in place; never throws.
 */
export async function enrichRowsWithClientExpectations(
  rows: Array<Record<string, any>>,
  kind: "client" | "lead"
): Promise<void> {
  const list = (rows ?? []).filter((r) => r && typeof r === "object");
  for (const row of list) applyClientExpectations(row);

  const missing = list.filter(stillMissing);
  if (!missing.length) {
    if (DEBUG) {
      console.log("[clientExpectations] enrich", {
        kind,
        rows: list.length,
        backfilledFromDb: 0,
        stillMissing: 0,
      });
    }
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    let assessmentRows: any[] = [];

    if (kind === "client") {
      const ids = Array.from(new Set(missing.map((r) => r.id).filter(Boolean)));
      if (ids.length) {
        const { data, error } = await supabase
          .from("assessments")
          .select("id, client_id, result, answers, completed_at, created_at")
          .in("client_id", ids)
          .eq("assessment_type", "client")
          .order("completed_at", { ascending: false });
        if (!error) assessmentRows = (data ?? []) as any[];
      }
      const byClient = new Map<string, any>();
      for (const a of assessmentRows) {
        if (a.client_id && !byClient.has(a.client_id)) byClient.set(a.client_id, a);
      }
      for (const row of missing) {
        const a = row.id ? byClient.get(row.id) : null;
        if (!a) continue;
        const found = extractClientExpectations(a);
        if (!cleanStr(row.appreciation_style) && found.appreciationStyle) {
          row.appreciation_style = found.appreciationStyle;
        }
        if (!cleanStr(row.agent_expectations_notes) && found.agentExpectationsNotes) {
          row.agent_expectations_notes = found.agentExpectationsNotes;
        }
      }
    } else {
      const ids = Array.from(
        new Set(missing.map((r) => r.client_assessment_id).filter(Boolean))
      );
      if (ids.length) {
        const { data, error } = await supabase
          .from("assessments")
          .select("id, result, answers, completed_at, created_at")
          .in("id", ids);
        if (!error) assessmentRows = (data ?? []) as any[];
      }
      const byId = new Map<string, any>();
      for (const a of assessmentRows) if (a.id) byId.set(a.id, a);
      for (const row of missing) {
        const a = row.client_assessment_id ? byId.get(row.client_assessment_id) : null;
        if (!a) continue;
        const found = extractClientExpectations(a);
        if (!cleanStr(row.appreciation_style) && found.appreciationStyle) {
          row.appreciation_style = found.appreciationStyle;
        }
        if (!cleanStr(row.agent_expectations_notes) && found.agentExpectationsNotes) {
          row.agent_expectations_notes = found.agentExpectationsNotes;
        }
      }
    }
  } catch (error) {
    // Resilience layer only; the caller keeps whatever data it already had.
    console.error("[clientExpectations] enrichment lookup failed:", error);
  }

  if (DEBUG) {
    const remaining = list.filter(stillMissing).length;
    console.log("[clientExpectations] enrich", {
      kind,
      rows: list.length,
      backfilledFromDb: missing.length - remaining,
      stillMissing: remaining,
    });
  }
}

/**
 * Single-row convenience used by the match finalize / resend email flows.
 * Mutates and returns the row (or null when given null).
 */
export async function enrichRowWithClientExpectations<T extends Record<string, any>>(
  row: T | null,
  kind: "client" | "lead"
): Promise<T | null> {
  if (!row) return null;
  await enrichRowsWithClientExpectations([row], kind);
  return row;
}
