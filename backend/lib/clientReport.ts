import {
  getArchetypeGuidelines,
  normalizeArchetypeName,
  isApprovedClientArchetype,
  CLIENT_ARCHETYPE_DETAILS,
  type ArchetypeGuidelines,
  type ClientArchetypeProfile,
} from "./archetypes.js";

/**
 * Builds the detailed, Relational-Roadmap-style report object for a single
 * client assessment, derived ENTIRELY from the canonical approved archetype data
 * (backend/lib/archetypes.ts). It never invents copy: when an archetype is
 * missing/invalid or a field is unavailable, the corresponding value is null/[]
 * and the UI shows a safe fallback ("Not available", "Not specified").
 *
 * This keeps the reviewer page + agent dashboard client cards in sync with the
 * single source of truth and avoids duplicating the (large) archetype text into
 * the frontend.
 */

export type SimultaneousProfile = { approaches: string[]; avoid: string };

// ---------------------------------------------------------------------------
// Appreciation style (final client assessment questions)
// ---------------------------------------------------------------------------

/** Approved stored values for the appreciation_style assessment question. */
export const APPRECIATION_STYLE_VALUES = [
  "uplifting_words",
  "proactive_assistance",
  "memorable_gestures",
  "dedicated_attention",
  "personalized_celebrations",
] as const;

export type AppreciationStyle = (typeof APPRECIATION_STYLE_VALUES)[number];

const APPRECIATION_STYLE_LABELS: Record<string, string> = {
  uplifting_words: "Uplifting Words",
  proactive_assistance: "Proactive Assistance",
  memorable_gestures: "Memorable Gestures",
  dedicated_attention: "Dedicated Attention",
  personalized_celebrations: "Personalized Celebrations",
};

export function isApprovedAppreciationStyle(value: unknown): value is AppreciationStyle {
  return (
    typeof value === "string" &&
    (APPRECIATION_STYLE_VALUES as readonly string[]).includes(value.trim().toLowerCase())
  );
}

/**
 * Shared formatter: readable label for a stored appreciation style value.
 * Approved values map to their display label; any other non-empty value is
 * returned as-is (legacy free-text support); empty/missing returns null so
 * callers can render "Not answered" / "Not provided".
 */
export function formatAppreciationStyle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return APPRECIATION_STYLE_LABELS[raw.toLowerCase()] ?? raw;
}

export type ClientReportDetail = {
  /** Approved client archetype display name, or null if not approved. */
  archetypeDisplayName: string | null;
  /** One-line archetype summary, or null. */
  summary: string | null;
  /** 1 to 4 bullets describing what this client is after (real data only). */
  whatThisClientIsAfter: string[];
  buyerProfile: ClientArchetypeProfile | null;
  sellerProfile: ClientArchetypeProfile | null;
  simultaneousProfile: SimultaneousProfile | null;
  guidelines: ArchetypeGuidelines | null;
  /** Raw stored appreciation style value (e.g. "dedicated_attention"), or null. */
  appreciationStyle: string | null;
  /** Readable label for the appreciation style, or null when not answered. */
  appreciationStyleLabel: string | null;
  /** Open-ended expectations/questions the client submitted, or null. */
  agentExpectationsNotes: string | null;
  /** Legacy alias of agentExpectationsNotes kept for existing renderers. */
  expectationsOrQuestions: string | null;
};

export type BuildClientReportInput = {
  archetype?: string | null;
  /** Raw transaction intent: "buying" | "selling" | "other". */
  transactionIntent?: string | null;
  transactionIntentLabel?: string | null;
  marketCity?: string | null;
  /** Optional, only if the client/profile actually carries it. */
  appreciationStyle?: string | null;
  /** Optional open-ended expectations text (agent_expectations_notes). */
  agentExpectationsNotes?: string | null;
  /** Legacy alias accepted when agentExpectationsNotes is not provided. */
  expectationsOrQuestions?: string | null;
};

function cleanStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/**
 * Compose "what this client is after" from real archetype motivations, weighted
 * by the client's transaction intent. Returns up to 4 bullets; empty when no
 * approved archetype data is available.
 */
function composeWhatTheyAreAfter(
  intent: string | null,
  buyer: ClientArchetypeProfile | null,
  seller: ClientArchetypeProfile | null
): string[] {
  const buyerM = buyer?.motivations ?? [];
  const sellerM = seller?.motivations ?? [];
  const out: string[] = [];
  const i = (intent ?? "").toLowerCase();

  if (i === "buying") {
    out.push(...buyerM);
  } else if (i === "selling") {
    out.push(...sellerM);
  } else {
    // "other"/unknown/both → blend buyer + seller motivations without faking.
    if (buyerM[0]) out.push(buyerM[0]);
    if (sellerM[0]) out.push(sellerM[0]);
    if (buyerM[1]) out.push(buyerM[1]);
    if (sellerM[1]) out.push(sellerM[1]);
  }
  // De-duplicate and cap at 4.
  return Array.from(new Set(out)).slice(0, 4);
}

export function buildClientReportDetail(input: BuildClientReportInput): ClientReportDetail {
  const approved = isApprovedClientArchetype(input.archetype);
  const name = approved ? normalizeArchetypeName(input.archetype) : null;
  const details = name ? CLIENT_ARCHETYPE_DETAILS[name] ?? null : null;
  const guidelines = name ? getArchetypeGuidelines(name) : null;
  const buyerProfile = details?.buyerProfile ?? null;
  const sellerProfile = details?.sellerProfile ?? null;
  const simultaneousProfile = guidelines?.simultaneous ?? null;

  return {
    archetypeDisplayName: name,
    summary: details?.summary ?? null,
    whatThisClientIsAfter: composeWhatTheyAreAfter(
      input.transactionIntent ?? null,
      buyerProfile,
      sellerProfile
    ),
    buyerProfile,
    sellerProfile,
    simultaneousProfile,
    guidelines,
    appreciationStyle: cleanStr(input.appreciationStyle),
    appreciationStyleLabel: formatAppreciationStyle(input.appreciationStyle),
    agentExpectationsNotes: cleanStr(input.agentExpectationsNotes ?? input.expectationsOrQuestions),
    expectationsOrQuestions: cleanStr(input.agentExpectationsNotes ?? input.expectationsOrQuestions),
  };
}

/**
 * Attach a `.report` detail object to a raw client/lead row (snake_case fields),
 * preserving all existing fields. Pure function, no DB access, no new columns
 * required (missing optional fields simply become null).
 */
export function attachClientReport<T extends Record<string, any>>(
  row: T
): T & { report: ClientReportDetail } {
  return {
    ...row,
    report: buildClientReportDetail({
      archetype: row.archetype ?? null,
      transactionIntent: row.transaction_intent ?? null,
      transactionIntentLabel: row.transaction_intent_label ?? null,
      marketCity: row.market_city ?? null,
      // These columns may not exist; reading an absent field yields undefined → null.
      // Historical field names (camelCase, legacy expectations columns, and the
      // result JSON embed) are all accepted so old records keep working.
      appreciationStyle:
        row.appreciation_style ??
        row.appreciationStyle ??
        (row.result && typeof row.result === "object" ? (row.result as any).appreciationStyle : null) ??
        null,
      agentExpectationsNotes:
        row.agent_expectations_notes ??
        row.agentExpectationsNotes ??
        (row.result && typeof row.result === "object"
          ? (row.result as any).agentExpectationsNotes
          : null) ??
        null,
      expectationsOrQuestions:
        row.expectations_or_questions ?? row.expectations ?? null,
    }),
  };
}
