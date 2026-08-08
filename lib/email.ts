import nodemailer from "nodemailer";
import { env } from "./env";

/**
 * Transactional email over SMTP.
 *
 * When SMTP is not configured the message is logged instead of sent, which
 * keeps local development usable without a mail provider. In production a
 * missing configuration is reported as a failure so a silent drop cannot hide a
 * broken password-reset flow.
 */

interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendInput): Promise<{ delivered: boolean }> {
  const smtp = env.smtp;

  if (!smtp) {
    if (env.isProduction) {
      console.error("[email] SMTP is not configured; cannot send", { subject });
      return { delivered: false };
    }
    console.info(
      `[email] SMTP not configured — message intended for ${to}\n` +
        `Subject: ${subject}\n${text}`,
    );
    return { delivered: false };
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  await transport.sendMail({ from: smtp.from, to, subject, text, html });
  return { delivered: true };
}

/** Shared shell so all transactional email looks like the product. */
function layout(heading: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#171717;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#15803d;">RentFinder</p>
      <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
      ${body}
      <p style="margin:32px 0 0;font-size:12px;color:#6b7280;">
        RentFinder &middot; Rentals across Ghana
      </p>
    </div>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  expiresInMinutes: number,
): Promise<{ delivered: boolean }> {
  const text = [
    "We received a request to reset your RentFinder password.",
    "",
    `Reset your password: ${resetUrl}`,
    "",
    `This link can be used once and expires in ${expiresInMinutes} minutes.`,
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");

  const html = layout(
    "Reset your password",
    `<p style="margin:0 0 20px;line-height:1.6;">We received a request to reset your RentFinder password. Use the button below to choose a new one.</p>
     <p style="margin:0 0 24px;">
       <a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Reset password</a>
     </p>
     <p style="margin:0 0 8px;line-height:1.6;font-size:14px;color:#4b5563;">
       This link can be used once and expires in ${expiresInMinutes} minutes.
     </p>
     <p style="margin:0;line-height:1.6;font-size:14px;color:#4b5563;">
       If you did not request a password reset, you can safely ignore this email.
     </p>`,
  );

  return sendEmail({
    to,
    subject: "Reset your RentFinder password",
    html,
    text,
  });
}
