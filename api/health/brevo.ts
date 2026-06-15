import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http";
import { getEnv } from "../../backend/lib/env";

/**
 * GET /api/health/brevo
 * Reports whether Brevo is configured. Does NOT send any email and never exposes
 * the key. When BREVO_API_KEY is missing, returns ok:true with testMode:true so
 * deployments without email still pass health checks (email runs in test mode).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    const configured = getEnv().hasBrevoApiKey;
    sendJson(res, 200, {
      ok: true,
      configured,
      testMode: !configured,
      message: configured
        ? "Brevo API key is configured. Transactional email will be sent live."
        : "No Brevo API key — email runs in test mode (logged, not sent).",
      timestamp: new Date().toISOString(),
    });
  });
}
