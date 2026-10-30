import { route } from "../router.js";
import { Fields, HttpError, Reply, isPlainObject, rateLimit } from "../http.js";
import { emailConfigured, sendEmail } from "../email.js";
import { pushConfigured, sendPush, vapidPublicKey } from "../push.js";

route("GET", "/push/public-key", async () => ({ publicKey: vapidPublicKey(), configured: pushConfigured() }));

route("POST", "/push/subscribe", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields().str("endpoint", b.endpoint, { max: 1000 });
  if (!isPlainObject(b.keys)) f.fail("keys", "Missing keys");
  else f.str("p256dh", b.keys.p256dh, { max: 200 }).str("auth", b.keys.auth, { max: 100 });
  const v = f.done();
  let url; try { url = new URL(v.endpoint); } catch { url = null; }
  if (!url || url.protocol !== "https:") throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { endpoint: "Must be an https URL" });
  await ctx.db.tx(async (q) => {
    const n = (await q.query("select count(*)::int as n from push_subscriptions where user_id = $1 and endpoint <> $2", [ctx.user.id, v.endpoint])).rows[0].n;
    if (n >= 10) throw new HttpError(400, "TOO_MANY", "You have too many subscribed devices. Remove one first.");
    // an endpoint identifies one browser profile, so a shared browser moves to whoever is signed in now
    await q.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4,$5)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [ctx.user.id, v.endpoint, v.p256dh, v.auth, (ctx.req.headers.get("user-agent") ?? "").slice(0, 300)]);
  });
  return new Reply(201, { ok: true });
});

route("POST", "/push/unsubscribe", async (ctx) => {
  const b = await ctx.json();
  await ctx.db.query("delete from push_subscriptions where user_id = $1 and endpoint = $2", [ctx.user.id, String(b.endpoint ?? "")]);
  return new Reply(204);
});

route("GET", "/reminders/status", async (ctx) => {
  const [prefs, subs, upcoming, recent] = await Promise.all([
    ctx.db.query("select email_reminders, push_reminders from preferences where user_id = $1", [ctx.user.id]),
    ctx.db.query("select count(*)::int as n from push_subscriptions where user_id = $1", [ctx.user.id]),
    ctx.db.query("select channel, kind, title, send_at as \"sendAt\" from reminders where user_id = $1 and status = 'pending' order by send_at limit 8", [ctx.user.id]),
    ctx.db.query("select channel, kind, title, status, last_error as \"detail\", coalesce(sent_at, send_at) as \"at\" from reminders where user_id = $1 and status <> 'pending' order by coalesce(sent_at, send_at) desc limit 8", [ctx.user.id]),
  ]);
  const p = prefs.rows[0] ?? {};
  return {
    email: { enabled: Boolean(p.email_reminders), configured: emailConfigured() },
    push: { enabled: Boolean(p.push_reminders), configured: pushConfigured(), devices: subs.rows[0].n },
    upcoming: upcoming.rows, recent: recent.rows,
  };
});

// Sends one real message right now so the student can confirm delivery works. Never fakes success.
route("POST", "/reminders/test", async (ctx) => {
  await rateLimit(ctx.db, `remtest:${ctx.user.id}`, 5, 3600);
  const b = await ctx.json();
  const f = new Fields().enum("channel", b.channel, ["email", "push"]).done();
  if (f.channel === "email") {
    if (!emailConfigured()) return { status: "not_configured", message: "Email is not set up on this server yet." };
    try { await sendEmail({ to: ctx.user.email, subject: "LoadWise test reminder", text: "This is a test reminder from LoadWise. Delivery works." }); return { status: "sent", message: `Sent to ${ctx.user.email}.` }; }
    catch { return new Reply(502, { error: { code: "DELIVERY_FAILED", message: "The email provider rejected the message." } }); }
  }
  if (!pushConfigured()) return { status: "not_configured", message: "Push notifications are not set up on this server yet." };
  const subs = (await ctx.db.query("select * from push_subscriptions where user_id = $1", [ctx.user.id])).rows;
  if (!subs.length) return { status: "no_device", message: "Turn on push notifications on this device first." };
  let sent = 0;
  for (const s of subs) {
    try { const r = await sendPush(s, { title: "LoadWise test", body: "Push notifications work on this device.", url: "/settings", tag: "test" }); if (r.gone) await ctx.db.query("delete from push_subscriptions where id = $1", [s.id]); else if (r.ok) sent++; } catch { /* counted below */ }
  }
  return sent ? { status: "sent", message: `Sent to ${sent} device${sent === 1 ? "" : "s"}.` } : new Reply(502, { error: { code: "DELIVERY_FAILED", message: "No device accepted the message. Try turning push off and on again." } });
});
