/**
 * Outbound email — used by the contact / DMCA / report forms.
 *
 * Provider resolution (first configured one wins):
 *   1. Resend           — set RESEND_API_KEY (recommended, simplest).
 *   2. SMTP (Proton…)   — set SMTP_HOST/PORT/USER/PASS.
 *   3. Not configured   — sendEmail() returns {ok:false, reason:"not_configured"}
 *                         so the API can respond honestly instead of pretending.
 *
 * CONTACT_TO is the inbox that receives every form submission.
 * CONTACT_FROM is the verified sender address (defaults to CONTACT_TO).
 */

export type EmailResult =
  | { ok: true; provider: "resend" | "smtp" }
  | { ok: false; reason: "not_configured" | "send_failed" };

export interface OutboundEmail {
  subject: string;
  /** Plain-text body. */
  text: string;
  /** Optional reply-to (the submitter's address), so you can answer directly. */
  replyTo?: string;
}

function recipients() {
  const to = process.env.CONTACT_TO?.trim();
  const from =
    process.env.CONTACT_FROM?.trim() ||
    (to ? `LumenGallery <${to}>` : undefined);
  return { to, from };
}

async function sendViaResend(email: OutboundEmail): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const { to, from } = recipients();
  if (!apiKey || !to || !from) return { ok: false, reason: "not_configured" };

  try {
    // Lazy import so the dependency isn't pulled in when SMTP-only.
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: email.subject,
      text: email.text,
      replyTo: email.replyTo,
    });
    if (error) return { ok: false, reason: "send_failed" };
    return { ok: true, provider: "resend" };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

async function sendViaSmtp(email: OutboundEmail): Promise<EmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const { to, from } = recipients();
  if (!host || !user || !pass || !to || !from) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    // nodemailer is optional — only needed for the SMTP path. Imported by name
    // through a variable so the build doesn't require it when using Resend.
    const mod = "nodemailer";
    const nodemailer = (await import(/* webpackIgnore: true */ mod)).default as {
      createTransport: (opts: unknown) => {
        sendMail: (opts: unknown) => Promise<unknown>;
      };
    };
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      replyTo: email.replyTo,
    });
    return { ok: true, provider: "smtp" };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

/** Send an email via the first configured provider. */
export async function sendEmail(email: OutboundEmail): Promise<EmailResult> {
  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend(email);
  }
  if (process.env.SMTP_HOST?.trim()) {
    return sendViaSmtp(email);
  }
  return { ok: false, reason: "not_configured" };
}

/** True when at least one provider + recipient is configured. */
export function isEmailConfigured(): boolean {
  const { to } = recipients();
  return Boolean(
    to && (process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim()),
  );
}
