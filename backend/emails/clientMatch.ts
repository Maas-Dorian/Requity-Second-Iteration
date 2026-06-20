import { emailLayout, REQUITY_COLORS } from "./layout.js";

export type ClientMatchEmailParams = {
  /** Name of the client that was matched. */
  clientName?: string | null;
  /** Optional client archetype. */
  clientArchetype?: string | null;
  /** Matched agent display name. */
  agentName?: string | null;
  /** Match score or fit label ("Strong fit", "82", etc.). */
  matchLabel?: string | null;
  /** Optional transaction intent label (Buying / Selling / custom text). */
  transaction?: string | null;
  /** Optional city/market the client is looking in. */
  market?: string | null;
  /** Dashboard/reviewer URL the CTA button links to. */
  dashboardUrl: string;
};

export const CLIENT_MATCH_SUBJECT = "New REQUITY match available";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detailRow(label: string, value: string): string {
  return `<tr>
<td style="padding:6px 0;font-size:14px;color:${REQUITY_COLORS.muted};width:160px;vertical-align:top;">${label}</td>
<td style="padding:6px 0;font-size:14px;color:${REQUITY_COLORS.ink};font-weight:bold;">${value}</td>
</tr>`;
}

/**
 * Email sent to an agent (and optionally a reviewer/admin) when REQUITY creates
 * or identifies a match that is ready to review.
 */
export function clientMatchEmail(params: ClientMatchEmailParams): string {
  const fallback = (v?: string | null) => (v && String(v).trim() ? escapeHtml(String(v).trim()) : "Not specified");
  const dashboardUrl = params.dashboardUrl;
  const matchValue = params.matchLabel && String(params.matchLabel).trim()
    ? escapeHtml(String(params.matchLabel).trim())
    : "Ready to review";

  const body = `
<h1 style="margin:0 0 12px;font-size:22px;color:${REQUITY_COLORS.navy};">New REQUITY match available</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px;">A client has a new REQUITY match ready to review.</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid ${REQUITY_COLORS.border};border-bottom:1px solid ${REQUITY_COLORS.border};margin:0 0 22px;">
${detailRow("Client", fallback(params.clientName))}
${detailRow("Client Archetype", fallback(params.clientArchetype))}
${detailRow("Matched Agent", fallback(params.agentName))}
${detailRow("Transaction", fallback(params.transaction))}
${detailRow("Market", fallback(params.market))}
${detailRow("Match", matchValue)}
</table>
<p style="margin:0 0 22px;"><a href="${dashboardUrl}" style="display:inline-block;background:${REQUITY_COLORS.orange};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 26px;border-radius:8px;">View match in REQUITY</a></p>
<p style="font-size:13px;line-height:1.6;margin:0 0 18px;color:${REQUITY_COLORS.muted};">Or open this link: <a href="${dashboardUrl}" style="color:${REQUITY_COLORS.navy};">${dashboardUrl}</a></p>
<p style="font-size:13px;color:${REQUITY_COLORS.muted};margin:0;">You're receiving this because you are connected to this REQUITY assessment.</p>`;

  return emailLayout({
    body,
    preheader: `${params.clientName ? String(params.clientName).trim() : "A client"} has a new REQUITY match ready to review.`,
  });
}
