import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingTableError } from "./supabaseWrite.js";

/**
 * REQUITY location helper.
 *
 * All proximity work is backend-only (the browser never receives a city dataset
 * or runs distance math). This module:
 *   - normalizes free-text city/state into a stable "city, st" key
 *   - resolves coordinates with a cache-first strategy:
 *       1. public.location_cache (DB cache)
 *       2. a small built-in metro lookup (no external call)
 *       3. a state-centroid fallback (same-state proximity)
 *       4. null  → callers fall back to city/state text matching
 *   - computes great-circle distance (haversine)
 *   - turns distance + service radius into a 0-100 location score + reason
 *
 * Designed so a real external geocoder can be slotted into geocode() later
 * without touching callers (they already cache + fall back gracefully).
 */

export type Coordinates = { latitude: number; longitude: number };

export type GeocodeResult = {
  normalized: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: string; // 'cache' | 'builtin' | 'state_centroid' | 'none'
};

// --- US state handling ------------------------------------------------------

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const VALID_ABBR = new Set(Object.values(STATE_NAME_TO_ABBR));

/** Approximate geographic centroid (lat, lon) per state, for same-state fallback. */
const STATE_CENTROIDS: Record<string, Coordinates> = {
  AL: { latitude: 32.8, longitude: -86.8 }, AK: { latitude: 64.2, longitude: -149.5 },
  AZ: { latitude: 34.2, longitude: -111.7 }, AR: { latitude: 34.9, longitude: -92.4 },
  CA: { latitude: 37.2, longitude: -119.4 }, CO: { latitude: 39.0, longitude: -105.5 },
  CT: { latitude: 41.6, longitude: -72.7 }, DE: { latitude: 39.0, longitude: -75.5 },
  DC: { latitude: 38.9, longitude: -77.0 }, FL: { latitude: 28.6, longitude: -82.4 },
  GA: { latitude: 32.6, longitude: -83.4 }, HI: { latitude: 20.3, longitude: -156.4 },
  ID: { latitude: 44.4, longitude: -114.6 }, IL: { latitude: 40.0, longitude: -89.2 },
  IN: { latitude: 39.9, longitude: -86.3 }, IA: { latitude: 42.0, longitude: -93.5 },
  KS: { latitude: 38.5, longitude: -98.4 }, KY: { latitude: 37.5, longitude: -85.3 },
  LA: { latitude: 31.0, longitude: -92.0 }, ME: { latitude: 45.4, longitude: -69.2 },
  MD: { latitude: 39.0, longitude: -76.8 }, MA: { latitude: 42.3, longitude: -71.8 },
  MI: { latitude: 44.3, longitude: -85.6 }, MN: { latitude: 46.3, longitude: -94.3 },
  MS: { latitude: 32.7, longitude: -89.7 }, MO: { latitude: 38.4, longitude: -92.5 },
  MT: { latitude: 46.9, longitude: -110.0 }, NE: { latitude: 41.5, longitude: -99.8 },
  NV: { latitude: 39.3, longitude: -116.6 }, NH: { latitude: 43.7, longitude: -71.6 },
  NJ: { latitude: 40.1, longitude: -74.7 }, NM: { latitude: 34.4, longitude: -106.1 },
  NY: { latitude: 42.9, longitude: -75.5 }, NC: { latitude: 35.6, longitude: -79.4 },
  ND: { latitude: 47.5, longitude: -100.5 }, OH: { latitude: 40.3, longitude: -82.8 },
  OK: { latitude: 35.6, longitude: -97.5 }, OR: { latitude: 44.0, longitude: -120.5 },
  PA: { latitude: 40.9, longitude: -77.8 }, RI: { latitude: 41.7, longitude: -71.5 },
  SC: { latitude: 33.9, longitude: -80.9 }, SD: { latitude: 44.4, longitude: -100.2 },
  TN: { latitude: 35.9, longitude: -86.4 }, TX: { latitude: 31.5, longitude: -99.3 },
  UT: { latitude: 39.3, longitude: -111.7 }, VT: { latitude: 44.1, longitude: -72.7 },
  VA: { latitude: 37.5, longitude: -78.9 }, WA: { latitude: 47.4, longitude: -120.5 },
  WV: { latitude: 38.6, longitude: -80.6 }, WI: { latitude: 44.6, longitude: -90.0 },
  WY: { latitude: 43.0, longitude: -107.6 },
};

/**
 * Built-in coordinates for major US metros, keyed by normalized "city, st".
 * Backend-only and intentionally small (covers the bulk of real usage); the DB
 * cache handles everything else once an external geocoder is configured.
 */
const BUILTIN_CITY_COORDS: Record<string, Coordinates> = {
  "new york, ny": { latitude: 40.7128, longitude: -74.006 },
  "los angeles, ca": { latitude: 34.0522, longitude: -118.2437 },
  "chicago, il": { latitude: 41.8781, longitude: -87.6298 },
  "houston, tx": { latitude: 29.7604, longitude: -95.3698 },
  "phoenix, az": { latitude: 33.4484, longitude: -112.074 },
  "philadelphia, pa": { latitude: 39.9526, longitude: -75.1652 },
  "san antonio, tx": { latitude: 29.4241, longitude: -98.4936 },
  "san diego, ca": { latitude: 32.7157, longitude: -117.1611 },
  "dallas, tx": { latitude: 32.7767, longitude: -96.797 },
  "austin, tx": { latitude: 30.2672, longitude: -97.7431 },
  "san jose, ca": { latitude: 37.3382, longitude: -121.8863 },
  "fort worth, tx": { latitude: 32.7555, longitude: -97.3308 },
  "jacksonville, fl": { latitude: 30.3322, longitude: -81.6557 },
  "columbus, oh": { latitude: 39.9612, longitude: -82.9988 },
  "charlotte, nc": { latitude: 35.2271, longitude: -80.8431 },
  "indianapolis, in": { latitude: 39.7684, longitude: -86.1581 },
  "seattle, wa": { latitude: 47.6062, longitude: -122.3321 },
  "denver, co": { latitude: 39.7392, longitude: -104.9903 },
  "washington, dc": { latitude: 38.9072, longitude: -77.0369 },
  "boston, ma": { latitude: 42.3601, longitude: -71.0589 },
  "nashville, tn": { latitude: 36.1627, longitude: -86.7816 },
  "el paso, tx": { latitude: 31.7619, longitude: -106.485 },
  "detroit, mi": { latitude: 42.3314, longitude: -83.0458 },
  "oklahoma city, ok": { latitude: 35.4676, longitude: -97.5164 },
  "portland, or": { latitude: 45.5152, longitude: -122.6784 },
  "las vegas, nv": { latitude: 36.1699, longitude: -115.1398 },
  "memphis, tn": { latitude: 35.1495, longitude: -90.049 },
  "louisville, ky": { latitude: 38.2527, longitude: -85.7585 },
  "baltimore, md": { latitude: 39.2904, longitude: -76.6122 },
  "milwaukee, wi": { latitude: 43.0389, longitude: -87.9065 },
  "albuquerque, nm": { latitude: 35.0844, longitude: -106.6504 },
  "tucson, az": { latitude: 32.2226, longitude: -110.9747 },
  "fresno, ca": { latitude: 36.7378, longitude: -119.7871 },
  "sacramento, ca": { latitude: 38.5816, longitude: -121.4944 },
  "mesa, az": { latitude: 33.4152, longitude: -111.8315 },
  "kansas city, mo": { latitude: 39.0997, longitude: -94.5786 },
  "atlanta, ga": { latitude: 33.749, longitude: -84.388 },
  "miami, fl": { latitude: 25.7617, longitude: -80.1918 },
  "raleigh, nc": { latitude: 35.7796, longitude: -78.6382 },
  "omaha, ne": { latitude: 41.2565, longitude: -95.9345 },
  "colorado springs, co": { latitude: 38.8339, longitude: -104.8214 },
  "long beach, ca": { latitude: 33.7701, longitude: -118.1937 },
  "virginia beach, va": { latitude: 36.8529, longitude: -75.978 },
  "oakland, ca": { latitude: 37.8044, longitude: -122.2712 },
  "minneapolis, mn": { latitude: 44.9778, longitude: -93.265 },
  "tampa, fl": { latitude: 27.9506, longitude: -82.4572 },
  "orlando, fl": { latitude: 28.5383, longitude: -81.3792 },
  "fort lauderdale, fl": { latitude: 26.1224, longitude: -80.1373 },
  "st. petersburg, fl": { latitude: 27.7676, longitude: -82.6403 },
  "new orleans, la": { latitude: 29.9511, longitude: -90.0715 },
  "cleveland, oh": { latitude: 41.4993, longitude: -81.6944 },
  "pittsburgh, pa": { latitude: 40.4406, longitude: -79.9959 },
  "cincinnati, oh": { latitude: 39.1031, longitude: -84.512 },
  "st. louis, mo": { latitude: 38.627, longitude: -90.1994 },
  "salt lake city, ut": { latitude: 40.7608, longitude: -111.891 },
  "san francisco, ca": { latitude: 37.7749, longitude: -122.4194 },
  "scottsdale, az": { latitude: 33.4942, longitude: -111.9261 },
  "boise, id": { latitude: 43.615, longitude: -116.2023 },
  "richmond, va": { latitude: 37.5407, longitude: -77.436 },
  "buffalo, ny": { latitude: 42.8864, longitude: -78.8784 },
  "brooklyn, ny": { latitude: 40.6782, longitude: -73.9442 },
};

// --- Normalization ----------------------------------------------------------

function cleanPart(value: string | null | undefined): string {
  return (value ?? "").toString().trim();
}

/** Resolve a free-text state ("Florida" / "fl" / "FL.") to a 2-letter abbr, or null. */
export function normalizeState(state: string | null | undefined): string | null {
  const raw = cleanPart(state).replace(/\.+$/, "");
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && VALID_ABBR.has(upper)) return upper;
  const byName = STATE_NAME_TO_ABBR[raw.toLowerCase()];
  return byName ?? null;
}

/**
 * Parse a combined "Miami, FL" / "Miami FL" / "Miami" string into city + state.
 * State is returned as a 2-letter abbreviation when recognizable.
 */
export function parseCityState(
  combined: string | null | undefined
): { city: string | null; state: string | null } {
  const raw = cleanPart(combined);
  if (!raw) return { city: null, state: null };
  // Prefer an explicit comma split: "City, ST".
  if (raw.includes(",")) {
    const [cityPart, ...rest] = raw.split(",");
    const state = normalizeState(rest.join(",").trim());
    return { city: cleanPart(cityPart) || null, state };
  }
  // Otherwise try a trailing token as a state ("Miami FL" or "Miami Florida").
  const tokens = raw.split(/\s+/);
  if (tokens.length >= 2) {
    const tail2 = tokens[tokens.length - 1];
    const tail2State = normalizeState(tail2);
    if (tail2State) {
      return { city: tokens.slice(0, -1).join(" ") || null, state: tail2State };
    }
  }
  return { city: raw, state: null };
}

/**
 * Build a stable normalized key like "miami, fl". When the state is unknown the
 * key is just the lowercased city ("miami"). Returns null when nothing usable.
 */
export function normalizeCityState(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  // Allow callers to pass a combined value in `city` (e.g. "Miami, FL").
  let c = cleanPart(city);
  let st = normalizeState(state);
  if (c && !st && (c.includes(",") || /\s/.test(c))) {
    const parsed = parseCityState(c);
    c = parsed.city ?? c;
    if (parsed.state) st = parsed.state;
  }
  c = c.toLowerCase().replace(/\s+/g, " ").trim();
  if (!c) return st ? st.toLowerCase() : null;
  return st ? `${c}, ${st.toLowerCase()}` : c;
}

// --- Distance (haversine, backend-only) -------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles between two coordinates. */
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// --- Geocoding (cache-first, no browser work) -------------------------------

/**
 * Resolve coordinates for a city/state using the cache-first strategy. Never
 * throws: a missing location_cache table or any failure degrades to a built-in
 * / state-centroid / null result so assessment submission is never blocked.
 */
export async function geocode(
  city: string | null | undefined,
  state: string | null | undefined
): Promise<GeocodeResult> {
  const { city: parsedCity, state: parsedState } =
    city && (city.includes(",") || /\s/.test(city)) && !state
      ? parseCityState(city)
      : { city: cleanPart(city) || null, state: normalizeState(state) };
  const normalized = normalizeCityState(parsedCity, parsedState);

  const empty: GeocodeResult = {
    normalized: normalized ?? "",
    city: parsedCity,
    state: parsedState,
    latitude: null,
    longitude: null,
    provider: "none",
  };
  if (!normalized) return empty;

  const supabase = getSupabaseAdmin();

  // 1. DB cache.
  try {
    const { data } = await supabase
      .from("location_cache")
      .select("latitude, longitude, city, state, provider")
      .eq("normalized", normalized)
      .maybeSingle();
    if (data && data.latitude != null && data.longitude != null) {
      console.log("LOCATION_GEOCODE_CACHE_HIT", { normalized });
      return {
        normalized,
        city: data.city ?? parsedCity,
        state: data.state ?? parsedState,
        latitude: data.latitude,
        longitude: data.longitude,
        provider: "cache",
      };
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[location] cache lookup failed:", error instanceof Error ? error.message : error);
    }
  }

  console.log("LOCATION_GEOCODE_CACHE_MISS", { normalized });

  // 2. Built-in metro lookup, then 3. state centroid.
  let coords: Coordinates | null = BUILTIN_CITY_COORDS[normalized] ?? null;
  let provider = "builtin";
  if (!coords && parsedState && STATE_CENTROIDS[parsedState]) {
    coords = STATE_CENTROIDS[parsedState];
    provider = "state_centroid";
  }
  if (!coords) return empty;

  // Cache the resolved coordinates so we only resolve a market once.
  try {
    await supabase.from("location_cache").upsert(
      {
        normalized,
        city: parsedCity,
        state: parsedState,
        latitude: coords.latitude,
        longitude: coords.longitude,
        provider,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "normalized" }
    );
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[location] cache write failed:", error instanceof Error ? error.message : error);
    }
  }

  return { normalized, city: parsedCity, state: parsedState, latitude: coords.latitude, longitude: coords.longitude, provider };
}

/**
 * Resolve and return the persistable location fields for a single market. Safe
 * to call at write time (geocoding is cached and never throws). Returns the
 * normalized key + state + coordinates (coordinates may be null).
 */
export async function resolveMarketLocation(
  rawCity: string | null | undefined,
  rawState: string | null | undefined
): Promise<{ city: string | null; state: string | null; normalized: string | null; latitude: number | null; longitude: number | null }> {
  const geo = await geocode(rawCity, rawState);
  if (geo.normalized) console.log("LOCATION_NORMALIZED", { normalized: geo.normalized, provider: geo.provider });
  return {
    city: geo.city,
    state: geo.state,
    normalized: geo.normalized || null,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}

// --- Location scoring (backend-only) ----------------------------------------

export type LocationScoreResult = {
  score: number; // 0-100
  distanceMiles: number | null;
  /** A short, reviewer-facing phrase describing the location fit. */
  phrase: string;
  /** True when the agent's service radius excludes this market. */
  outsideRadius: boolean;
};

export type LocationParty = {
  city?: string | null;
  state?: string | null;
  normalized?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function sameCity(a: LocationParty, b: LocationParty): boolean {
  return Boolean(a.normalized && b.normalized && a.normalized === b.normalized);
}
function sameState(a: LocationParty, b: LocationParty): boolean {
  const sa = normalizeState(a.state) ?? (((a.normalized?.split(",")[1] ?? "").trim().toUpperCase()) || null);
  const sb = normalizeState(b.state) ?? (((b.normalized?.split(",")[1] ?? "").trim().toUpperCase()) || null);
  return Boolean(sa && sb && sa === sb);
}

/**
 * Score the proximity of a single client market to an agent (0-100) plus a
 * distance (miles, when both have coordinates) and a short phrase. Honors the
 * agent's service radius: a market outside the radius is capped low.
 *
 * Tiers (per spec):
 *   same city/state .......... 100
 *   <= 10 mi ................. 100
 *   <= 25 mi .................  90
 *   <= 50 mi .................  75
 *   <= 100 mi ................  55
 *   same state, no distance ..  40
 *   unknown location .........  20
 *   out of radius ............  0-25
 */
export function scoreLocationFit(
  client: LocationParty,
  agent: LocationParty,
  serviceRadiusMiles: number | null | undefined
): LocationScoreResult {
  const hasClientLoc = Boolean(client.normalized || (client.latitude != null && client.longitude != null));
  const hasAgentLoc = Boolean(agent.normalized || (agent.latitude != null && agent.longitude != null));
  if (!hasClientLoc || !hasAgentLoc) {
    return { score: 20, distanceMiles: null, phrase: "location unknown", outsideRadius: false };
  }

  if (sameCity(client, agent)) {
    return { score: 100, distanceMiles: 0, phrase: "same market", outsideRadius: false };
  }

  const radius = typeof serviceRadiusMiles === "number" && serviceRadiusMiles > 0 ? serviceRadiusMiles : null;

  if (
    client.latitude != null && client.longitude != null &&
    agent.latitude != null && agent.longitude != null
  ) {
    const dist = Math.round(distanceMiles(client.latitude, client.longitude, agent.latitude, agent.longitude));
    const outsideRadius = radius != null && dist > radius;
    let score: number;
    let phrase: string;
    if (dist <= 10) { score = 100; phrase = "within 10 miles"; }
    else if (dist <= 25) { score = 90; phrase = "within 25 miles"; }
    else if (dist <= 50) { score = 75; phrase = "within 50 miles"; }
    else if (dist <= 100) { score = 55; phrase = "within 100 miles"; }
    else if (sameState(client, agent)) { score = 40; phrase = "same state"; }
    else { score = 25; phrase = `about ${dist} miles away`; }
    if (outsideRadius) {
      // Outside the agent's stated service radius: cap to 0-25 by distance.
      score = Math.min(score, dist > 250 ? 0 : dist > 150 ? 10 : 25);
      phrase = "outside preferred radius";
    }
    return { score, distanceMiles: dist, phrase, outsideRadius };
  }

  // No coordinates but we do have normalized text: same-state fallback.
  if (sameState(client, agent)) {
    return { score: 40, distanceMiles: null, phrase: "same state", outsideRadius: false };
  }
  return { score: 25, distanceMiles: null, phrase: "different market", outsideRadius: radius != null };
}

/**
 * Combine a personality/archetype compatibility score (0-100) with a location
 * score (0-100) and an availability score (0-100) using the REQUITY weighting:
 *   70% compatibility, 25% location, 5% availability.
 */
export function combineMatchScore(
  compatibilityScore: number,
  locationScore: number,
  availabilityScore = 100
): number {
  return Math.round(compatibilityScore * 0.7 + locationScore * 0.25 + availabilityScore * 0.05);
}

// --- Match eligibility (location is REQUIRED) -------------------------------

/** Agent default service radius (miles) when none is configured. */
export const DEFAULT_SERVICE_RADIUS_MILES = 50;

/**
 * True when an agent row has a usable location for matching: coordinates, OR a
 * city + state, OR a normalized location key. Agents without any of these are
 * NOT eligible for automatic match recommendations. Location is never inferred
 * from email, name, or source.
 */
export function hasUsableAgentLocation(agent: any): boolean {
  if (!agent) return false;
  return Boolean(
    (agent.latitude != null && agent.longitude != null) ||
      (cleanPart(agent.market_city) && cleanPart(agent.market_state)) ||
      cleanPart(agent.location_normalized)
  );
}

/**
 * True when a client/lead row has at least one usable market (buying, selling,
 * or general) by coordinates, city + state, or a normalized location key.
 */
export function hasUsableClientLocation(row: any): boolean {
  if (!row) return false;
  return Boolean(
    (row.buying_latitude != null && row.buying_longitude != null) ||
      (row.selling_latitude != null && row.selling_longitude != null) ||
      (row.latitude != null && row.longitude != null) ||
      (cleanPart(row.buying_market_city) && cleanPart(row.buying_market_state)) ||
      (cleanPart(row.selling_market_city) && cleanPart(row.selling_market_state)) ||
      (cleanPart(row.market_city) && cleanPart(row.market_state)) ||
      cleanPart(row.location_normalized)
  );
}

export type LocationEligibility = {
  eligible: boolean;
  locationScore: number; // 0-100
  distanceMiles: number | null;
  reason: string;
  warning?: string;
  /** True when the agent covers only one side of a buying-and-selling client. */
  limitedFit?: boolean;
};

export type ClientMarketSide = { side: "buying" | "selling" | "general"; party: LocationParty };

function effectiveRadius(radius: number | null | undefined): number {
  return typeof radius === "number" && radius > 0 ? radius : DEFAULT_SERVICE_RADIUS_MILES;
}

function phraseToReason(phrase: string): string {
  switch (phrase) {
    case "same market": return "Same market";
    case "within 10 miles": return "Within 10 miles";
    case "within 25 miles": return "Within 25 miles";
    case "within 50 miles": return "Within 50 miles";
    case "within 100 miles": return "Within 100 miles";
    case "same state": return "Same state";
    default: return phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : "Eligible";
  }
}

/** A single client market is in range when it is the same market or inside the radius. */
function sideInRange(loc: LocationScoreResult, radius: number): boolean {
  if (loc.phrase === "same market") return true;
  if (loc.distanceMiles != null) return !loc.outsideRadius && loc.distanceMiles <= radius;
  return false; // no coordinates and not an exact market match: not a strong fit
}

/**
 * Decide whether an agent is eligible for an automatic location-based match to a
 * client's market(s), with the score, distance, and a reviewer-facing reason.
 * Location is REQUIRED: an agent (or client) without a usable location is never
 * eligible.
 *
 * For a buying-and-selling client the agent must be within range of BOTH markets
 * to be a strong (best) match. Covering only one side returns eligible = true
 * with limitedFit + a warning so the reviewer knows it is not the best match.
 */
export function evaluateLocationEligibility(
  markets: ClientMarketSide[],
  agent: LocationParty,
  radius: number | null | undefined,
  agentHasLocation: boolean
): LocationEligibility {
  if (!agentHasLocation) {
    return { eligible: false, locationScore: 0, distanceMiles: null, reason: "Agent location missing" };
  }
  if (!markets.length) {
    return { eligible: false, locationScore: 0, distanceMiles: null, reason: "Client location missing" };
  }
  const eff = effectiveRadius(radius);
  const results = markets.map((m) => {
    const loc = scoreLocationFit(m.party, agent, eff);
    return { side: m.side, loc, inRange: sideInRange(loc, eff) };
  });
  const inRangeCount = results.filter((r) => r.inRange).length;

  // Buying-and-selling (two markets): require both sides in range for a best match.
  if (results.length >= 2) {
    if (inRangeCount === 0) {
      const nearest = results.reduce((a, b) =>
        (b.loc.distanceMiles ?? Infinity) < (a.loc.distanceMiles ?? Infinity) ? b : a
      );
      return { eligible: false, locationScore: 0, distanceMiles: nearest.loc.distanceMiles, reason: "Outside agent service range" };
    }
    if (inRangeCount < results.length) {
      const covered = results.find((r) => r.inRange)!;
      const sideWord = covered.side === "selling" ? "selling" : "buying";
      return {
        eligible: true,
        limitedFit: true,
        locationScore: Math.round(covered.loc.score * 0.6),
        distanceMiles: covered.loc.distanceMiles,
        reason: "Covers one market only",
        warning: `This agent is only in range for the ${sideWord} side.`,
      };
    }
    const worst = results.reduce((a, b) => (b.loc.score < a.loc.score ? b : a));
    return { eligible: true, locationScore: worst.loc.score, distanceMiles: worst.loc.distanceMiles, reason: phraseToReason(worst.loc.phrase) };
  }

  // Single market.
  const only = results[0];
  if (only.inRange) {
    return { eligible: true, locationScore: only.loc.score, distanceMiles: only.loc.distanceMiles, reason: phraseToReason(only.loc.phrase) };
  }
  if (only.loc.distanceMiles != null) {
    return { eligible: false, locationScore: 0, distanceMiles: only.loc.distanceMiles, reason: "Outside agent service range" };
  }
  if (only.loc.phrase === "same state") {
    return { eligible: false, locationScore: 40, distanceMiles: null, reason: "Same state only", warning: "Same state, but the city does not match and no coordinates are available." };
  }
  return { eligible: false, locationScore: 0, distanceMiles: null, reason: "Outside agent service range" };
}

export type ClientLocationStatus = {
  complete: boolean;
  requiredSide: "buying" | "selling" | "both" | "general";
  message: string | null;
};

function marketUsable(city: any, state: any, lat: any, lon: any): boolean {
  return Boolean((lat != null && lon != null) || (cleanPart(city) && cleanPart(state)));
}

/**
 * Required-location check for a client/lead by transaction intent (Part 3).
 * Buying needs a buying market, selling needs a selling market, buying-and-
 * selling needs both, other needs a general market. A general market is accepted
 * as a fallback so a single filled market is never lost.
 */
export function evaluateClientLocation(row: any): ClientLocationStatus {
  const intent = (row?.transaction_intent ?? "").toString();
  const buy = marketUsable(row?.buying_market_city, row?.buying_market_state, row?.buying_latitude, row?.buying_longitude);
  const sell = marketUsable(row?.selling_market_city, row?.selling_market_state, row?.selling_latitude, row?.selling_longitude);
  const general =
    marketUsable(row?.market_city, row?.market_state, row?.latitude, row?.longitude) ||
    Boolean(cleanPart(row?.location_normalized));
  const missingMsg = "Client location is missing. Add a buying or selling market before matching.";
  if (intent === "buying") return { complete: buy || general, requiredSide: "buying", message: buy || general ? null : missingMsg };
  if (intent === "selling") return { complete: sell || general, requiredSide: "selling", message: sell || general ? null : missingMsg };
  if (intent === "both") {
    const complete = (buy || general) && (sell || general);
    return { complete, requiredSide: "both", message: complete ? null : missingMsg };
  }
  return { complete: general || buy || sell, requiredSide: "general", message: general || buy || sell ? null : missingMsg };
}

/** Reviewer-facing one-line explanation combining personality + location fit. */
export function buildLocationMatchReason(
  compatibilityScore: number,
  location: LocationScoreResult
): string {
  const personality =
    compatibilityScore >= 90 ? "Strong personality fit" :
    compatibilityScore >= 75 ? "Good personality fit" :
    "Moderate personality fit";
  if (location.phrase === "location unknown") return "Location unknown, matched by personality only";
  if (location.phrase === "same market") return `${personality} and same market`;
  if (location.phrase === "outside preferred radius") return `${personality}, outside preferred radius`;
  if (location.phrase === "different market") return `${personality}, location unknown or outside market`;
  return `${personality}, ${location.phrase}`;
}
