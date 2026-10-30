// Email delivery through Resend's HTTP API (no SDK). Never pretends: when not configured it says so.
let transport = null;
export const setEmailTransport = (fn) => { transport = fn; }; // tests only

export const emailConfigured = () => Boolean(transport || (process.env.RESEND_API_KEY && process.env.EMAIL_FROM));

/** Resolves { ok:true, id } on real delivery, { skipped:true, reason } if unconfigured; throws on provider errors. */
export async function sendEmail({ to, subject, text, html }) {
  if (transport) return transport({ to, subject, text, html });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { skipped: true, reason: "email_not_configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.id };
}
