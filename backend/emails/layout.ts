/**
 * Shared REQUITY email layout.
 *
 * Keeps all transactional emails on-brand and consistent. Individual templates
 * provide only their inner body HTML and let this wrapper handle the shell.
 */

export const REQUITY_COLORS = {
  navy: "#07366E",
  orange: "#FF7500",
  ink: "#102033",
  muted: "#4A607C",
  border: "#D3E0F2",
} as const;

export type LayoutOptions = {
  /** Inner body HTML for the email content area. */
  body: string;
  /** Optional preheader text shown in inbox previews. */
  preheader?: string;
};

export function emailLayout({ body, preheader }: LayoutOptions): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f7fb;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;">
<tr>
<td align="center" style="padding:24px;">
<table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#ffffff;border:1px solid ${REQUITY_COLORS.border};border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:${REQUITY_COLORS.ink};">
<tr><td style="height:4px;background:${REQUITY_COLORS.orange};"></td></tr>
<tr>
<td style="padding:24px 28px 8px 28px;">
<div style="font-size:26px;font-weight:bold;color:${REQUITY_COLORS.navy};">RE<span style="color:${REQUITY_COLORS.orange};">Q</span>UITY</div>
</td>
</tr>
<tr>
<td style="padding:8px 28px 28px 28px;">
${body}
</td>
</tr>
<tr>
<td style="padding:18px 28px;background:#f4f7fb;text-align:center;">
<p style="margin:0;font-size:12px;color:${REQUITY_COLORS.muted};">&copy; ${year} REQUITY &middot; Building Better Professional Relationships</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
