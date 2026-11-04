import "server-only";
import { env } from "./env";
import { AppError } from "./errors";
import { log } from "./logger";

export function mailConfigured() {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS);
}

/** Sends one email through the configured SMTP server (Gmail app password in production). */
export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!mailConfigured()) throw new AppError("SERVICE_UNAVAILABLE", "Email is not available right now. Use another way to reset your password.");
  const e = env();
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    // Local test mailbox only (127.0.0.1): no TLS. Real servers (Gmail) always use TLS.
    ...(e.SMTP_HOST === "127.0.0.1" ? { ignoreTLS: true } : {}),
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: e.MAIL_FROM ?? e.SMTP_USER, to, subject, text, html });
  } catch (err) {
    log.error("Email sending failed", { error: (err as Error).message });
    throw new AppError("SERVICE_UNAVAILABLE", "We could not send the email. Try again in a minute or use another way to reset.");
  }
}
