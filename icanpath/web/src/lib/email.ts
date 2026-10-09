import { Resend } from "resend";

/**
 * Transactional email via Resend.
 *
 * Requires RESEND_API_KEY and RESEND_FROM_EMAIL. RESEND_FROM_EMAIL must be an
 * address on a domain verified in Resend (for example
 * "ICANPATH Academy <no-reply@icanpathacademy.com>"). When either is missing the
 * senders report failure and the caller degrades gracefully; no auth flow is
 * ever blocked by an email failure.
 */

const apiKey = process.env.RESEND_API_KEY;
const sender = process.env.RESEND_FROM_EMAIL;

function client(): Resend | null {
  return apiKey && sender && sender.includes("@") ? new Resend(apiKey) : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] as string);
}

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
      <tr>
        <td style="padding:0 0 16px">
          <p style="margin:0;font-size:14px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#0b6b53">
            ICANPATH <span style="color:#8a94a6">ACADEMY</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${heading}</h1>
          ${body}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 4px;color:#8a94a6;font-size:12px;line-height:1.5">
          You are receiving this because you have an ICANPATH Academy account.
          If this was not you, please contact support immediately.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function send(to: string, subject: string, heading: string, body: string, text: string): Promise<boolean> {
  const resend = client();
  if (!resend) {
    console.error("[email] Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).");
    return false;
  }
  const { error } = await resend.emails.send({ from: sender as string, to: [to], subject, html: layout(heading, body), text });
  if (error) {
    console.error("[email] send failed", error.message);
    return false;
  }
  return true;
}

export function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const firstName = escapeHtml(name.split(" ")[0] || "there");
  const body = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${firstName},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6">
      Welcome to ICANPATH Academy. Your account has been created and you can now
      enrol for an ICAN exam diet, join live classes and track your progress.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
      If you registered as a tutor, an administrator reviews your account before
      you can publish a course.
    </p>`;
  const text = `Welcome to ICANPATH Academy, ${name}. Your account has been created.`;
  return send(to, "Welcome to ICANPATH Academy", "Welcome aboard", body, text);
}

export function sendPasswordChangedEmail(to: string, name: string): Promise<boolean> {
  const firstName = escapeHtml(name.split(" ")[0] || "there");
  const body = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${firstName},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6">
      Your ICANPATH Academy password was changed successfully. You can now sign in
      with your new password.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
      If you did not make this change, reset your password immediately and contact
      support so we can secure the account.
    </p>`;
  const text = `Your ICANPATH Academy password was changed. If this was not you, reset it and contact support.`;
  return send(to, "Your ICANPATH Academy password was changed", "Password changed", body, text);
}
