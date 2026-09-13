import "server-only";
import { env } from "./env";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends through Resend (https://resend.com). Without an API key the message is
 * printed to the server log so the flow can be exercised in development.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!env.resendApiKey) {
    console.info(`[email:dev] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend rejected the email (${res.status}): ${detail.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function verificationEmail(to: string, displayName: string, token: string): EmailMessage {
  const link = `${env.appUrl}/verify?token=${encodeURIComponent(token)}`;
  const greeting = displayName ? `Hello ${escapeHtml(displayName)},` : "Hello,";
  const text = `${displayName ? `Hello ${displayName},` : "Hello,"}

Confirm your email address to open your shelf:

${link}

The link is valid for 24 hours. If you didn't create an account on The Shelf, you can ignore this message.`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f2ea;font-family:Georgia,'Iowan Old Style',serif;color:#2a2622">
  <div style="max-width:520px;margin:0 auto;background:#fbf9f4;border:1px solid #e6dfd2;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:18px;letter-spacing:-0.01em"><strong>The Shelf</strong></p>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.5">${greeting}</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5">Confirm your email address to open your shelf.</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#2f2a25;color:#f6f2ea;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:-apple-system,Segoe UI,sans-serif;font-size:14px">Confirm email</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b6259;font-family:-apple-system,Segoe UI,sans-serif">Or paste this link into your browser:<br><a href="${link}" style="color:#8a6a2f;word-break:break-all">${link}</a></p>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8a8178;font-family:-apple-system,Segoe UI,sans-serif">The link is valid for 24 hours. If you didn't create an account, ignore this message.</p>
  </div>
</body></html>`;
  return { to, subject: "Confirm your email for The Shelf", html, text };
}
