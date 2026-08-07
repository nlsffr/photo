/**
 * Outbound email — contact / DMCA / report forms.
 *
 * 1. Resend — RESEND_API_KEY
 * 2. SMTP — SMTP_HOST/PORT/USER/PASS
 * CONTACT_TO = inbox destinataire
 * CONTACT_FROM = expéditeur vérifié
 */

export type EmailResult =
  | { ok: true; provider: "resend" | "smtp" }
  | { ok: false; reason: "not_configured" | "send_failed" };

export interface OutboundEmail {
  subject: string;
  text: string;
  replyTo?: string;
}

function recipients() {
  const to = process.env.CONTACT_TO?.trim();
  const from =
    process.env.CONTACT_FROM?.trim() ||
    (to ? `LeakFanHub <${to}>` : undefined);
  return { to, from };
}

async function sendViaResend(email: OutboundEmail): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const { to, from } = recipients();
  if (!apiKey || !to || !from) return { ok: false, reason: "not_configured" };

  try {
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

export async function sendEmail(email: OutboundEmail): Promise<EmailResult> {
  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend(email);
  }
  if (process.env.SMTP_HOST?.trim()) {
    return sendViaSmtp(email);
  }
  return { ok: false, reason: "not_configured" };
}

export function isEmailConfigured(): boolean {
  const { to } = recipients();
  return Boolean(
    to && (process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim()),
  );
}
