import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Minimal HTTP helpers for REQUITY Vercel functions.
 * Small functions only — intentionally no web framework.
 */

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function applyCors(_req: VercelRequest, res: VercelResponse): void {
  const origin = process.env.VERCEL_FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export function ensureMethod(req: VercelRequest, method: "GET" | "POST"): void {
  if (req.method !== method) {
    throw new HttpError(405, `Method not allowed. Expected ${method}.`);
  }
}

/** Maximum accepted request body size (bytes) for public routes. */
export const MAX_BODY_BYTES = 100_000;

/** Reject overly large payloads early (cheap defense against abuse). */
export function assertPayloadSize(req: VercelRequest, maxBytes = MAX_BODY_BYTES): void {
  const header = req.headers["content-length"];
  const declared = Array.isArray(header) ? header[0] : header;
  if (declared && Number(declared) > maxBytes) {
    throw new HttpError(413, "Payload too large.");
  }
  const body = req.body;
  if (body != null) {
    const size =
      typeof body === "string"
        ? Buffer.byteLength(body)
        : Buffer.byteLength(JSON.stringify(body));
    if (size > maxBytes) throw new HttpError(413, "Payload too large.");
  }
}

export function getJsonBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid JSON body.");
    }
  }
  if (typeof body === "object") return body as Record<string, unknown>;
  throw new HttpError(400, "Invalid request body.");
}

/** Best-effort client IP for rate limiting. */
export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const value = Array.isArray(fwd) ? fwd[0] : fwd;
  if (value) return value.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// --- Small validation helpers --------------------------------------------

export function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Missing or invalid field: ${key}`);
  }
  return value;
}

export function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function requireObject(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = obj[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `Missing or invalid object field: ${key}`);
  }
  return value as Record<string, unknown>;
}

export function optionalRecord(
  obj: Record<string, unknown>,
  key: string
): Record<string, string> {
  const value = obj[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}

export function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T {
  const value = requireString(obj, key);
  if (!allowed.includes(value as T)) {
    throw new HttpError(400, `Invalid ${key}. Expected one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

// RFC-pragmatic email check (not exhaustive, rejects obvious junk).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254;
}

export function requireEmail(obj: Record<string, unknown>, key: string): string {
  const value = requireString(obj, key).trim().toLowerCase();
  if (!isValidEmail(value)) {
    throw new HttpError(400, `Invalid email: ${key}`);
  }
  return value;
}

export function optionalEmail(obj: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(obj, key);
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new HttpError(400, `Invalid email: ${key}`);
  return normalized;
}

/** Keep only phone-safe characters; return undefined when nothing usable. */
export function sanitizePhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\d+()\-\s]/g, "").trim();
  if (cleaned.replace(/\D/g, "").length < 7) return undefined;
  return cleaned.slice(0, 32);
}

/** Validate an optional date as YYYY-MM-DD; throws on a malformed value. */
export function optionalDate(obj: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(obj, key);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new HttpError(400, `Invalid date (expected YYYY-MM-DD): ${key}`);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) throw new HttpError(400, `Invalid date: ${key}`);
  return trimmed;
}

/** Require an answers payload: a non-empty object or array, capped in size. */
export function requireAnswers(
  obj: Record<string, unknown>,
  key: string,
  maxEntries = 200
): Record<string, unknown> | unknown[] {
  const value = obj[key];
  if (Array.isArray(value)) {
    if (value.length === 0) throw new HttpError(400, `Empty answers: ${key}`);
    if (value.length > maxEntries) throw new HttpError(400, `Too many answers: ${key}`);
    return value;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>);
    if (entries.length === 0) throw new HttpError(400, `Empty answers: ${key}`);
    if (entries.length > maxEntries) throw new HttpError(400, `Too many answers: ${key}`);
    return value as Record<string, unknown>;
  }
  throw new HttpError(400, `Missing or invalid answers: ${key}`);
}

export function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query[key];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export function requireQueryParam(req: VercelRequest, key: string): string {
  const value = getQueryParam(req, key);
  if (!value) throw new HttpError(400, `Missing query parameter: ${key}`);
  return value;
}

/**
 * Wraps a handler with CORS, OPTIONS preflight, and uniform error responses.
 */
export async function runHandler(
  req: VercelRequest,
  res: VercelResponse,
  fn: () => Promise<void>
): Promise<void> {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    await fn();
  } catch (error) {
    // Honor any error carrying a numeric `status` (HttpError, AuthError, ...).
    const status =
      typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    if (status >= 500) console.error("[api] handler error:", error);
    sendJson(res, status, { error: message });
  }
}
