export type BrevoEmail = {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendBrevoEmail(email: BrevoEmail): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "info@requityapp.com";
  const senderName = process.env.BREVO_SENDER_NAME || "REQUITY";

  if (!apiKey) {
    console.log("[BREVO TEST MODE]", email.subject, email.to.map(t => t.email));
    return { ok: true, messageId: "test-mode" };
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, ...email })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: JSON.stringify(body) };
  return { ok: true, messageId: body.messageId };
}

export function requityReviewerMatchEmail(clientName: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#ffffff;color:#102033;border:1px solid #D3E0F2;border-radius:16px;overflow:hidden">
    <div style="height:4px;background:#FF7500"></div>
    <div style="padding:28px">
      <h1 style="color:#07366E;margin:0 0 12px">You've received a client match from REQUITY!</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">${clientName} has been assigned to your dashboard by a REQUITY reviewer.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Please review the client profile, communication guidance, and what to avoid before reaching out.</p>
      <p style="font-size:14px;color:#4A607C;margin:0">If you have any issues, message <b>requity@support.com</b>. Thank you for working with us.</p>
    </div>
  </div>`;
}
