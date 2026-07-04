import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { updateWithSchemaFallback } from "./supabaseWrite.js";
import {
  resolveMarketLocation,
  hasUsableAgentLocation,
  hasUsableClientLocation,
  evaluateClientLocation,
} from "./location.js";

/**
 * Reviewer-only location management (add/edit/delete markets for agents,
 * clients, and reviewer leads) so a reviewer never has to touch Supabase by
 * hand. Only market/location columns are ever written or cleared; the person,
 * their assessment, and their match history are always preserved.
 */

export type ReviewerLocationTarget = "agent" | "client" | "lead";

export type ReviewerLocationInput = {
  marketCity?: string | null;
  marketState?: string | null;
  serviceRadiusMiles?: number | null;
  serviceAreas?: string | null;
  buyingMarketCity?: string | null;
  buyingMarketState?: string | null;
  sellingMarketCity?: string | null;
  sellingMarketState?: string | null;
};

export type ReviewerLocationStatus = "complete" | "partial" | "missing";

export type ReviewerLocationSummary = {
  ok: true;
  targetType: ReviewerLocationTarget;
  targetId: string;
  name: string | null;
  email: string | null;
  status: ReviewerLocationStatus;
  marketCity: string | null;
  marketState: string | null;
  serviceRadiusMiles: number | null;
  buyingMarketCity: string | null;
  buyingMarketState: string | null;
  sellingMarketCity: string | null;
  sellingMarketState: string | null;
  transactionIntent: string | null;
  /** True when an existing ACTIVE match now points at a location-incomplete party. */
  activeMatchNeedsLocationReview: boolean;
};

export const DEFAULT_SERVICE_RADIUS_MILES = 50;

/** Reviewer location validation error (mapped to HTTP 400 by the API route). */
export class LocationValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "LocationValidationError";
  }
}

function trimOrNull(value: unknown): string | null {
  const s = (value ?? "").toString().trim();
  return s ? s : null;
}

/** Title-case a city so "miami" and "MIAMI" store consistently as "Miami". */
function normalizeCity(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function tableForTarget(targetType: ReviewerLocationTarget): "agents" | "clients" | "assessment_leads" {
  if (targetType === "agent") return "agents";
  if (targetType === "client") return "clients";
  return "assessment_leads";
}

function nameColumn(targetType: ReviewerLocationTarget): string {
  return targetType === "agent" ? "display_name" : "full_name";
}

async function fetchTargetRow(
  targetType: ReviewerLocationTarget,
  targetId: string
): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(tableForTarget(targetType))
    .select("*")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

function summarize(
  targetType: ReviewerLocationTarget,
  targetId: string,
  row: any
): ReviewerLocationSummary {
  const isAgent = targetType === "agent";
  const usable = isAgent ? hasUsableAgentLocation(row) : hasUsableClientLocation(row);
  let status: ReviewerLocationStatus = usable ? "complete" : "missing";
  if (!isAgent) {
    const loc = evaluateClientLocation(row);
    status = loc.complete ? "complete" : usable ? "partial" : "missing";
  }
  return {
    ok: true,
    targetType,
    targetId,
    name: trimOrNull(row?.[nameColumn(targetType)]),
    email: trimOrNull(row?.email),
    status,
    marketCity: trimOrNull(row?.market_city),
    marketState: trimOrNull(row?.market_state),
    serviceRadiusMiles:
      typeof row?.service_radius_miles === "number" ? row.service_radius_miles : null,
    buyingMarketCity: trimOrNull(row?.buying_market_city),
    buyingMarketState: trimOrNull(row?.buying_market_state),
    sellingMarketCity: trimOrNull(row?.selling_market_city),
    sellingMarketState: trimOrNull(row?.selling_market_state),
    transactionIntent: trimOrNull(row?.transaction_intent),
    activeMatchNeedsLocationReview: false,
  };
}

/** True when this target is currently the party of an ACTIVE match_recommendations row. */
async function hasActiveMatch(targetType: ReviewerLocationTarget, targetId: string): Promise<boolean> {
  if (targetType === "agent") return false;
  const supabase = getSupabaseAdmin();
  const column = targetType === "client" ? "client_id" : "lead_id";
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("id")
      .eq(column, targetId)
      .in("status", ["active", "assigned", "approved"])
      .limit(1);
    if (error) throw new Error(error.message);
    return Boolean(data && data.length);
  } catch {
    return false;
  }
}

/**
 * Add or update the market/location for an agent, client, or lead. Coordinates
 * are resolved via the cached geocoder and are never required (city/state text
 * is always kept as the fallback). Returns the updated location summary.
 */
export async function updateReviewerLocation(params: {
  targetType: ReviewerLocationTarget;
  targetId: string;
  location: ReviewerLocationInput;
}): Promise<ReviewerLocationSummary> {
  const { targetType, targetId } = params;
  const input = params.location ?? {};
  const existing = await fetchTargetRow(targetType, targetId);
  if (!existing) throw new LocationValidationError("That record could not be found.");

  if (targetType === "agent") {
    const city = normalizeCity(trimOrNull(input.marketCity));
    const state = trimOrNull(input.marketState);
    if (!city || !state) {
      throw new LocationValidationError("A market city and state are required for an agent location.");
    }
    const radius =
      typeof input.serviceRadiusMiles === "number" && input.serviceRadiusMiles > 0
        ? Math.round(input.serviceRadiusMiles)
        : typeof existing.service_radius_miles === "number" && existing.service_radius_miles > 0
          ? existing.service_radius_miles
          : DEFAULT_SERVICE_RADIUS_MILES;
    const geo = await resolveMarketLocation(city, state);
    await updateWithSchemaFallback(
      "agents",
      {
        market_city: city,
        market_state: geo.state ?? state,
        service_radius_miles: radius,
        service_areas: trimOrNull(input.serviceAreas),
        latitude: geo.latitude,
        longitude: geo.longitude,
        location_normalized: geo.normalized,
      },
      { column: "id", value: targetId }
    );
  } else {
    // Client or lead: intent-aware markets. At least one full city+state pair.
    const buyingCity = normalizeCity(trimOrNull(input.buyingMarketCity));
    const buyingState = trimOrNull(input.buyingMarketState);
    const sellingCity = normalizeCity(trimOrNull(input.sellingMarketCity));
    const sellingState = trimOrNull(input.sellingMarketState);
    const generalCity = normalizeCity(trimOrNull(input.marketCity));
    const generalState = trimOrNull(input.marketState);

    const sides: { city: string | null; state: string | null; label: string }[] = [
      { city: buyingCity, state: buyingState, label: "buying" },
      { city: sellingCity, state: sellingState, label: "selling" },
      { city: generalCity, state: generalState, label: "general" },
    ];
    for (const s of sides) {
      if ((s.city && !s.state) || (!s.city && s.state)) {
        throw new LocationValidationError(
          `The ${s.label} market needs both a city and a state.`
        );
      }
    }
    if (!buyingCity && !sellingCity && !generalCity) {
      throw new LocationValidationError("Enter at least one market (buying, selling, or general).");
    }

    const payload: Record<string, unknown> = {};
    if (buyingCity && buyingState) {
      const geo = await resolveMarketLocation(buyingCity, buyingState);
      payload.buying_market_city = buyingCity;
      payload.buying_market_state = geo.state ?? buyingState;
      payload.buying_latitude = geo.latitude;
      payload.buying_longitude = geo.longitude;
    }
    if (sellingCity && sellingState) {
      const geo = await resolveMarketLocation(sellingCity, sellingState);
      payload.selling_market_city = sellingCity;
      payload.selling_market_state = geo.state ?? sellingState;
      payload.selling_latitude = geo.latitude;
      payload.selling_longitude = geo.longitude;
    }
    if (generalCity && generalState) {
      const geo = await resolveMarketLocation(generalCity, generalState);
      payload.market_city = generalCity;
      payload.market_state = geo.state ?? generalState;
      payload.latitude = geo.latitude;
      payload.longitude = geo.longitude;
      payload.location_normalized = geo.normalized;
    }
    await updateWithSchemaFallback(tableForTarget(targetType), payload, {
      column: "id",
      value: targetId,
    });
  }

  console.log("REVIEWER_LOCATION_UPDATED", { targetType, hasTarget: Boolean(targetId) });
  const updated = await fetchTargetRow(targetType, targetId);
  const summary = summarize(targetType, targetId, updated ?? existing);
  // Location was just added/updated; a complete location never needs review.
  summary.activeMatchNeedsLocationReview = false;
  return summary;
}

/**
 * Clear ONLY the market/location columns for an agent, client, or lead. The
 * person, their assessment, and their match history are never deleted. Returns
 * the (now missing-location) summary, flagging any existing active match.
 */
export async function clearReviewerLocation(params: {
  targetType: ReviewerLocationTarget;
  targetId: string;
}): Promise<ReviewerLocationSummary> {
  const { targetType, targetId } = params;
  const existing = await fetchTargetRow(targetType, targetId);
  if (!existing) throw new LocationValidationError("That record could not be found.");

  if (targetType === "agent") {
    await updateWithSchemaFallback(
      "agents",
      {
        market_city: null,
        market_state: null,
        latitude: null,
        longitude: null,
        location_normalized: null,
        location_place_id: null,
        service_areas: null,
      },
      { column: "id", value: targetId }
    );
  } else {
    await updateWithSchemaFallback(
      tableForTarget(targetType),
      {
        market_city: null,
        market_state: null,
        latitude: null,
        longitude: null,
        location_normalized: null,
        buying_market_city: null,
        buying_market_state: null,
        buying_latitude: null,
        buying_longitude: null,
        selling_market_city: null,
        selling_market_state: null,
        selling_latitude: null,
        selling_longitude: null,
      },
      { column: "id", value: targetId }
    );
  }

  console.log("REVIEWER_LOCATION_CLEARED", { targetType, hasTarget: Boolean(targetId) });
  const updated = await fetchTargetRow(targetType, targetId);
  const summary = summarize(targetType, targetId, updated ?? existing);
  summary.status = "missing";
  // Warn when an active match now points at a location-incomplete party.
  summary.activeMatchNeedsLocationReview = await hasActiveMatch(targetType, targetId);
  return summary;
}
