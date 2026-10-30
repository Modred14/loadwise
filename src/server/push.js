// Web Push (VAPID). Real delivery via the `web-push` library; honest about missing configuration.
let transport = null;
export const setPushTransport = (fn) => { transport = fn; }; // tests only

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
export const pushConfigured = () => Boolean(transport || (vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT));

/** Resolves {ok:true}, {gone:true} when the browser subscription expired, or throws on other failures. */
export async function sendPush(sub, payload) {
  if (transport) return transport(sub, payload);
  if (!pushConfigured()) return { skipped: true, reason: "push_not_configured" };
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, vapidPublicKey(), process.env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "normal" });
    return { ok: true };
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return { gone: true };
    throw new Error(`Push service responded ${e.statusCode ?? "error"}`);
  }
}
