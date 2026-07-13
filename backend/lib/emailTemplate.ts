import { getOptionalEnv } from "./env.js";

/**
 * Low-level REQUITY email templating primitives (server-side, no provider deps).
 *
 * This module owns the branded HTML/plain-text rendering and the public link
 * helpers. It has NO dependency on the provider transport or the higher-level
 * orchestration, so both email.ts (senders) and emailReports.ts (content
 * builders) can import it without creating an import cycle.
 *
 * All dynamic values are HTML-escaped. Rendering skips empty sections and never
 * prints undefined/null. Contains no cross dashes in the static copy.
 */

const PRODUCTION_SITE_URL = "https://www.requityapp.com";

/**
 * Resolve the public site origin for email CTAs (never localhost, never the old
 * Vercel preview domain). Order: PUBLIC_SITE_URL, then VERCEL_FRONTEND_URL, then
 * the production domain. All email links must point at https://www.requityapp.com.
 */
export function getPublicSiteUrl(): string {
  const configured = getOptionalEnv(
    "PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "VERCEL_FRONTEND_URL",
    "NEXT_PUBLIC_FRONTEND_URL",
    "VITE_FRONTEND_URL"
  );
  // Ignore localhost AND the deleted preview deployment so email CTA links never
  // point at a dead host, even if a stale VERCEL_FRONTEND_URL is still set.
  const usable =
    configured &&
    !/localhost|127\.0\.0\.1|requity-second-iteration\.vercel\.app/i.test(configured);
  const base = usable ? configured : PRODUCTION_SITE_URL;
  return base.replace(/\/$/, "");
}

export function agentDashboardUrl(): string {
  return `${getPublicSiteUrl()}/agent/dashboard.html`;
}

export function reviewerDashboardUrl(): string {
  return `${getPublicSiteUrl()}/reviewer/index.html`;
}

/** Escape a dynamic value for safe inclusion in HTML email bodies. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a dynamic value for HTML and convert line breaks to <br> so
 * multi-line client answers render safely with their formatting preserved.
 * Escaping always happens BEFORE the <br> insertion, so user content can
 * never inject markup.
 */
export function escapeHtmlMultiline(value: string | null | undefined): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

export type EmailDetail = { label: string; value: string | null | undefined };

export type EmailContentInput = {
  title: string;
  intro: string;
  details?: EmailDetail[];
  ctaLabel: string;
  ctaUrl: string;
};

/** Keep only detail rows that have a non-empty value (never show null/undefined). */
export function usableDetails(details?: EmailDetail[]): { label: string; value: string }[] {
  return (details ?? [])
    .map((d) => ({ label: d.label, value: (d.value ?? "").toString().trim() }))
    .filter((d) => d.value.length > 0);
}

/** Keep only non-empty string items (drops null/undefined/blank). */
function usableItems(items?: (string | null | undefined)[]): string[] {
  return (items ?? []).map((i) => (i ?? "").toString().trim()).filter((i) => i.length > 0);
}

function detailsTableHtml(rows: { label: string; value: string }[]): string {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;border-collapse:collapse;">${rows
    .map(
      (d) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#777;width:170px;vertical-align:top;">${escapeHtml(
          d.label
        )}</td><td style="padding:6px 0;font-size:15px;color:#1f1f1f;font-weight:600;">${escapeHtmlMultiline(
          d.value
        )}</td></tr>`
    )
    .join("")}</table>`;
}

/**
 * Build a complete, self-contained HTML email (full document) so any provider
 * accepts and renders it. All dynamic values are HTML-escaped. No cross dashes.
 * This is the simple single-CTA layout used by lighter notifications.
 */
export function buildRequityEmailHtml(input: EmailContentInput): string {
  const detailsHtml = detailsTableHtml(usableDetails(input.details));
  return wrapDocument({
    title: input.title,
    bodyHtml: `
              <h1 style="margin:12px 0 12px;font-size:26px;line-height:1.25;color:#1f1f1f;">${escapeHtml(
                input.title
              )}</h1>
              <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#4a4a4a;">${escapeHtml(
                input.intro
              )}</p>
              ${detailsHtml}
              ${ctaHtml(input.ctaLabel, input.ctaUrl)}`,
  });
}

/** Build a plain-text fallback from the same content (no cross dashes). */
export function buildPlainTextEmail(input: EmailContentInput): string {
  const rows = usableDetails(input.details);
  const lines = ["REQUITY", "", input.title, "", input.intro];
  if (rows.length) {
    lines.push("");
    for (const d of rows) lines.push(`${d.label}: ${d.value}`);
  }
  lines.push("", `${input.ctaLabel}: ${input.ctaUrl}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Rich, multi-section report layout (for content-rich emails).
// ---------------------------------------------------------------------------

export type EmailSection =
  | { kind: "heading"; text: string | null | undefined }
  | { kind: "paragraph"; text: string | null | undefined }
  | { kind: "details"; rows: EmailDetail[] }
  | { kind: "bullets"; heading?: string | null; items: (string | null | undefined)[] };

export type RichEmailContent = {
  title: string;
  /** Hidden preview text shown by many email clients. */
  preheader?: string | null;
  intro?: string | null;
  sections: EmailSection[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Optional small note under the CTA (e.g. "No login is required."). */
  footerNote?: string | null;
};

function headingHtml(text: string): string {
  return `<h2 style="margin:26px 0 8px;font-size:18px;line-height:1.3;color:#9a5b2e;">${escapeHtml(
    text
  )}</h2>`;
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtmlMultiline(
    text
  )}</p>`;
}

function bulletsHtml(items: string[]): string {
  return `<ul style="margin:6px 0 16px;padding-left:20px;">${items
    .map(
      (i) =>
        `<li style="margin:0 0 6px;font-size:15px;line-height:1.55;color:#3a3a3a;">${escapeHtml(
          i
        )}</li>`
    )
    .join("")}</ul>`;
}

function ctaHtml(label?: string | null, url?: string | null): string {
  const l = (label ?? "").trim();
  const u = (url ?? "").trim();
  if (!l || !u) return "";
  return `<a href="${escapeHtml(
    u
  )}" style="display:inline-block;background:#b8652f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px;margin-top:22px;">${escapeHtml(
    l
  )}</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#777;">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(
                u
              )}</span></p>`;
}

/** Shared branded document shell (mobile friendly, inline styles). */
function wrapDocument(input: { title: string; bodyHtml: string; preheader?: string | null }): string {
  const preheader = (input.preheader ?? "").trim();
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4ef;padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #ece6dc;">
          <tr>
            <td>
              <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#9a5b2e;font-weight:700;">REQUITY</div>
              ${input.bodyHtml}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#9a9a9a;">REQUITY. Real estate agent and client relationship platform.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Render a full, multi-section REQUITY HTML email. Empty sections are skipped. */
export function buildRequityReportHtml(input: RichEmailContent): string {
  const parts: string[] = [];
  parts.push(
    `<h1 style="margin:12px 0 12px;font-size:26px;line-height:1.25;color:#1f1f1f;">${escapeHtml(
      input.title
    )}</h1>`
  );
  const intro = (input.intro ?? "").trim();
  if (intro) parts.push(paragraphHtml(intro));

  for (const section of input.sections) {
    if (section.kind === "heading") {
      const t = (section.text ?? "").trim();
      if (t) parts.push(headingHtml(t));
    } else if (section.kind === "paragraph") {
      const t = (section.text ?? "").trim();
      if (t) parts.push(paragraphHtml(t));
    } else if (section.kind === "details") {
      const rows = usableDetails(section.rows);
      if (rows.length) parts.push(detailsTableHtml(rows));
    } else if (section.kind === "bullets") {
      const items = usableItems(section.items);
      if (items.length) {
        const h = (section.heading ?? "").trim();
        if (h) parts.push(headingHtml(h));
        parts.push(bulletsHtml(items));
      }
    }
  }

  const cta = ctaHtml(input.ctaLabel, input.ctaUrl);
  if (cta) parts.push(cta);
  const note = (input.footerNote ?? "").trim();
  if (note)
    parts.push(
      `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#777;">${escapeHtml(note)}</p>`
    );

  return wrapDocument({ title: input.title, bodyHtml: parts.join("\n              "), preheader: input.preheader });
}

/** Render the plain-text fallback for a rich email. No HTML, no null values. */
export function buildRequityReportText(input: RichEmailContent): string {
  const lines: string[] = ["REQUITY", "", input.title];
  const intro = (input.intro ?? "").trim();
  if (intro) lines.push("", intro);

  for (const section of input.sections) {
    if (section.kind === "heading") {
      const t = (section.text ?? "").trim();
      if (t) lines.push("", t.toUpperCase());
    } else if (section.kind === "paragraph") {
      const t = (section.text ?? "").trim();
      if (t) lines.push("", t);
    } else if (section.kind === "details") {
      const rows = usableDetails(section.rows);
      if (rows.length) {
        lines.push("");
        for (const d of rows) lines.push(`${d.label}: ${d.value}`);
      }
    } else if (section.kind === "bullets") {
      const items = usableItems(section.items);
      if (items.length) {
        const h = (section.heading ?? "").trim();
        if (h) lines.push("", h.toUpperCase());
        for (const i of items) lines.push(`- ${i}`);
      }
    }
  }

  const l = (input.ctaLabel ?? "").trim();
  const u = (input.ctaUrl ?? "").trim();
  if (l && u) lines.push("", `${l}: ${u}`);
  const note = (input.footerNote ?? "").trim();
  if (note) lines.push("", note);

  return lines.join("\n");
}
