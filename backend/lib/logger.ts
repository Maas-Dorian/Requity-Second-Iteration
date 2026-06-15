/**
 * Minimal structured logger for the API layer.
 *
 * Console-based for now (Vercel captures stdout/stderr). Sanitizes context to
 * avoid logging PII such as full phone numbers and dates of birth. Emails are
 * masked. Swap the sink later (e.g. a log drain) without changing callers.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

// Keys whose values must never be logged in full.
const DROP_KEYS = new Set(["dateofbirth", "dob", "date_of_birth", "birthday", "answers"]);
const MASK_PHONE_KEYS = new Set(["phone", "phonenumber", "phone_number"]);
const MASK_EMAIL_KEYS = new Set(["email", "recipientemail", "recipient_email"]);

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  const shown = name.slice(0, Math.min(2, name.length));
  return `${shown}***@${domain}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-2)}`;
}

function sanitize(ctx: LogContext | undefined): LogContext | undefined {
  if (!ctx) return undefined;
  const out: LogContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    const k = key.toLowerCase();
    if (DROP_KEYS.has(k)) continue;
    if (value == null) {
      out[key] = value;
    } else if (typeof value === "string" && MASK_EMAIL_KEYS.has(k)) {
      out[key] = maskEmail(value);
    } else if (typeof value === "string" && MASK_PHONE_KEYS.has(k)) {
      out[key] = maskPhone(value);
    } else if (typeof value === "object") {
      out[key] = "[object]"; // avoid leaking nested PII (e.g. contact blobs)
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  const line = {
    level,
    message,
    ...(sanitize(ctx) ?? {}),
    ts: new Date().toISOString(),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (message: string, ctx?: LogContext) => emit("info", message, ctx),
  warn: (message: string, ctx?: LogContext) => emit("warn", message, ctx),
  error: (message: string, ctx?: LogContext) => emit("error", message, ctx),
};

// --- Convenience helpers used across API routes -------------------------

export function logApiStart(route: string, ctx?: LogContext): void {
  logger.info(`api:start ${route}`, ctx);
}

export function logValidationFailure(route: string, reason: string, ctx?: LogContext): void {
  logger.warn(`api:validation ${route}`, { reason, ...(ctx ?? {}) });
}

export function logSupabaseError(scope: string, error: unknown, ctx?: LogContext): void {
  logger.error(`supabase:error ${scope}`, {
    error: error instanceof Error ? error.message : String(error),
    ...(ctx ?? {}),
  });
}

export function logBrevoFailure(scope: string, error: unknown, ctx?: LogContext): void {
  logger.warn(`brevo:failure ${scope}`, {
    error: error instanceof Error ? error.message : String(error),
    ...(ctx ?? {}),
  });
}
