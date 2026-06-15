import { emailLayout, REQUITY_COLORS } from "./layout";

export type ReviewerMatchEmailParams = {
  /** Name of the client being assigned to the agent. */
  clientName: string;
  /** Optional agent first name for a warmer greeting. */
  agentName?: string;
  /** Optional dashboard link for the agent to view the client. */
  dashboardUrl?: string;
};

export const REVIEWER_MATCH_SUBJECT = "You've received a client match from REQUITY!";

/**
 * Email sent to an agent when a REQUITY reviewer approves and assigns a client.
 * Body copy follows backend/docs/CURSOR_BUILD_PLAN.md exactly.
 */
export function reviewerMatchEmail(params: ReviewerMatchEmailParams): string {
  const { clientName, agentName, dashboardUrl } = params;
  const greeting = agentName ? `Hi ${agentName},` : "Hi there,";

  const body = `
<h1 style="margin:0 0 12px;font-size:22px;color:${REQUITY_COLORS.navy};">You've received a client match from REQUITY!</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${greeting}</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
<b>${clientName}</b> has been assigned to your dashboard by a REQUITY reviewer with the badge
<span style="display:inline-block;background:${REQUITY_COLORS.orange};color:#ffffff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:bold;">REQUITY Client Match</span>.
</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 18px;">
Please review the client profile, communication guidance, and what to avoid before reaching out.
</p>
${
  dashboardUrl
    ? `<p style="margin:0 0 22px;"><a href="${dashboardUrl}" style="display:inline-block;background:${REQUITY_COLORS.orange};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 26px;border-radius:8px;">View Client in Dashboard</a></p>`
    : ""
}
<p style="font-size:14px;color:${REQUITY_COLORS.muted};margin:0;">
If you have any issues message <b>requity@support.com</b>. Thank you for working with us.
</p>`;

  return emailLayout({
    body,
    preheader: `${clientName} has been matched to you by a REQUITY reviewer.`,
  });
}
