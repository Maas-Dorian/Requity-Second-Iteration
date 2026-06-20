import { emailLayout, REQUITY_COLORS } from "./layout.js";

export type ClientCompleteEmailParams = {
  /** Name of the client who completed the assessment. */
  clientName: string;
  /** Optional agent first name for a warmer greeting. */
  agentName?: string;
  /** Optional computed client archetype. */
  archetype?: string;
  /** Optional transaction intent label (Buying / Selling / custom text). */
  transaction?: string | null;
  /** Optional city/market the client is looking in. */
  market?: string | null;
};

export const CLIENT_COMPLETE_SUBJECT = "A client completed their REQUITY assessment";

/**
 * Email sent to an agent when one of their QR / agent-link clients completes the
 * REQUITY assessment. (Reviewer-sourced clients use the reviewer match email.)
 */
export function clientAssessmentCompleteEmail(params: ClientCompleteEmailParams): string {
  const { clientName, agentName, archetype, transaction, market } = params;
  const greeting = agentName ? `Hi ${agentName},` : "Hi there,";
  const transactionLabel = transaction && transaction.trim() ? transaction.trim() : "Not specified";
  const marketLabel = market && market.trim() ? market.trim() : "Not specified";

  const body = `
<h1 style="margin:0 0 12px;font-size:22px;color:${REQUITY_COLORS.navy};">A client completed their assessment</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${greeting}</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 8px;">
<b>${clientName}</b> just completed their REQUITY assessment.${
    archetype ? ` Their client archetype is <b>${archetype}</b>.` : ""
}
</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Transaction: <b>${transactionLabel}</b><br/>Market: <b>${marketLabel}</b></p>
<p style="font-size:15px;line-height:1.6;margin:0 0 18px;">
This client came from your link, so their profile is saved directly in your dashboard. Review their communication guidance before reaching out.
</p>
<p style="font-size:14px;color:${REQUITY_COLORS.muted};margin:0;">
If you have any issues message <b>requity@support.com</b>. Thank you for working with us.
</p>`;

  return emailLayout({
    body,
    preheader: `${clientName} completed their REQUITY assessment.`,
  });
}
