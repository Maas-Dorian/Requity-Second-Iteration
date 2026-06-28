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
  /** Only populated when the client actually supplied it; never fabricated. */
  appreciationStyle: string | null;
  /** Only populated when the client actually supplied it; never fabricated. */
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
  /** Optional, only if the client/profile actually carries it. */
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
    expectationsOrQuestions: cleanStr(input.expectationsOrQuestions),
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
      appreciationStyle: row.appreciation_style ?? null,
      expectationsOrQuestions:
        row.expectations_or_questions ?? row.expectations ?? null,
    }),
  };
}
