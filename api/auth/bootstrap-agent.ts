import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  optionalString,
  sanitizePhone,
  assertPayloadSize,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getUserFromRequest } from "../../backend/lib/auth.js";
import { createAgentProfileForUser, getProfileByUserId } from "../../backend/lib/users.js";
import { ensureAgentSlug } from "../../backend/lib/agentSlug.js";
import { buildAgentAssessmentLinks } from "../../backend/lib/dashboard.js";
import { normalizePublicOrigin } from "../../backend/lib/env.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "auth/bootstrap-agent";

/**
 * POST /api/auth/bootstrap-agent
 * Protected, requires Authorization: Bearer <access_token>.
 * Creates/updates the caller's profile (role='agent') and agent row, then
 * returns the profile, agent, public token, and shareable links.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const user = await getUserFromRequest(req);
    if (!user) throw new HttpError(401, "Authentication required.");

    const body = getJsonBody(req);
    const email = optionalString(body, "email") ?? user.email;
    if (!email) throw new HttpError(400, "An email is required to bootstrap the agent.");

    const termsAccepted = body["termsAccepted"] === true;
    const termsVersion = optionalString(body, "termsVersion") ?? null;

    // ToS gate: required ONLY when creating a brand-new profile (account
    // creation). Existing users (sign-in auto-bootstrap, agent-row backfill)
    // already have a profile and are never asked to re-accept.
    const existingProfile = await getProfileByUserId(user.id);
    if (!existingProfile && !termsAccepted) {
      throw new HttpError(
        400,
        "Terms of Service acceptance is required.",
        "TERMS_REQUIRED"
      );
    }

    try {
      const { profile, agent } = await createAgentProfileForUser({
        userId: user.id,
        email,
        fullName: optionalString(body, "fullName") ?? null,
        phone: sanitizePhone(body["phone"]) ?? null,
        brokerage: optionalString(body, "brokerage") ?? null,
        licenseNumber: optionalString(body, "licenseNumber") ?? null,
        termsAccepted,
        termsVersion,
      });

      // Always resolve to the live production origin (a stale frontendUrl or the
      // deleted preview deployment is ignored) so dashboard/share links work.
      const base = normalizePublicOrigin(optionalString(body, "frontendUrl"));
      const token = agent.public_assessment_token;

      // Generate (or reuse) the branded public slug from the agent's name.
      // Resilient: returns null on schema drift, in which case the response
      // falls back to the legacy token links below.
      const frontendUrl = optionalString(body, "frontendUrl") ?? undefined;
      const publicSlug = await ensureAgentSlug(agent.id, agent.display_name);
      const links = buildAgentAssessmentLinks({ token, slug: publicSlug, frontendUrl });

      // Safe server log (no tokens/keys/PII), confirms the self-heal worked.
      console.log("AUTH_BOOTSTRAP_AGENT", {
        hasUser: true,
        profileUpserted: Boolean(profile && profile.id),
        agentUpserted: Boolean(agent && agent.id),
        role: profile?.role ?? null,
        hasPublicSlug: Boolean(publicSlug),
      });

      // Resolutions agents (@resolutions.realtor) skip the agent assessment. Log
      // the bypass (no PII beyond the domain marker) so the routing is auditable.
      if (typeof email === "string" && email.toLowerCase().trim().endsWith("@resolutions.realtor")) {
        console.log("AUTH_ASSESSMENT_BYPASS_RESOLUTIONS_AGENT", {
          agentUpserted: Boolean(agent && agent.id),
          reason: "resolutions_email_domain",
        });
      }

      // Safe response: ok + the minimal profile/agent the client needs to route.
      // No access/refresh tokens, no service role key, no full auth payload. The
      // public_assessment_token (used for shareable QR/links) is intentionally
      // surfaced as publicToken for the dashboard's link/QR feature.
      sendJson(res, 200, {
        ok: true,
        profile: profile
          ? { id: profile.id, email: profile.email, role: profile.role }
          : null,
        agent: agent
          ? {
              id: agent.id,
              email: agent.email,
              displayName: agent.display_name,
              archetype: agent.archetype ?? null,
            }
          : null,
        publicToken: token,
        publicSlug: publicSlug,
        dashboardUrl: `${base}/agent/dashboard.html`,
        // Branded clean links when a slug exists; legacy token links otherwise.
        assessmentLink: links.assessmentLink,
        qrLink: links.qrLink,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { userId: user.id });
      throw error;
    }
  });
}
