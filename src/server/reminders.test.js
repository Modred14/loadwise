import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { client, createTestDb, hasTestDb, registerUser } from "./testing.js";
import { setEmailTransport } from "./email.js";
import { setPushTransport } from "./push.js";
import { dispatchReminders, enqueueReminders } from "./reminders.js";
import { zonedToUtc, wallClockNow } from "./time.js";

const opts = { skip: !hasTestDb && "set TEST_DATABASE_URL to run backend integration tests" };
let env, ipn = 0;
before(async () => { if (hasTestDb) env = await createTestDb(); });
after(async () => { await env?.close(); });
afterEach(() => { setEmailTransport(null); setPushTransport(null); delete process.env.CRON_SECRET; });
const user = async () => { const c = client(env.db, `7.7.7.${++ipn}`); const u = await registerUser(c); return { c, u }; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const rows = async (userId, where = "") => (await env.db.query(`select * from reminders where user_id = $1 ${where} order by send_at`, [userId])).rows;

// A task due exactly 24h from `now` (UTC), so the 24h-lead reminder is due immediately and the 2h one is pending.
async function setup({ email = true, push = false, tz = "UTC" } = {}) {
  const { c, u } = await user();
  await c.put("/preferences", { emailReminders: email, pushReminders: push, timezone: tz, sessionReminders: false });
  const course = (await c.post("/courses", { code: "R1", name: "Reminders" })).data;
  const now = new Date(); now.setUTCSeconds(0, 0);
  const due = new Date(now.getTime() + 24 * 3600_000);
  const task = (await c.post("/tasks", { courseId: course.id, title: "Final exam", type: "exam", dueDate: ymd(due), dueTime: hm(due), estimatedHours: 6 })).data;
  return { c, u, task, now, due, course };
}

test("enqueue is deduplicated and email goes out only when due; second lead time fires later", opts, async () => {
  const sent = []; setEmailTransport(async (m) => { sent.push(m); return { ok: true }; });
  const { u, now } = await setup();
  const first = await enqueueReminders(env.db, now);
  assert.equal(first.created, 2); // 24h and 2h leads
  assert.equal((await enqueueReminders(env.db, now)).created, 0); // idempotent
  assert.equal((await dispatchReminders(env.db, now)).sent, 1);
  assert.match(sent[0].subject, /Final exam .* is due in 1 day/);
  assert.equal((await dispatchReminders(env.db, now)).sent, 0); // not sent twice
  assert.equal((await rows(u.id, "and status = 'pending'")).length, 1);
  const later = new Date(now.getTime() + 22 * 3600_000 + 60_000);
  assert.equal((await dispatchReminders(env.db, later)).sent, 1);
  assert.match(sent[1].subject, /due in 2 hours/);
  assert.equal(sent.length, 2);
});

test("time zones: reminder instants are computed from the student's local deadline", opts, async () => {
  assert.equal(zonedToUtc("2026-03-10", "09:00", "Africa/Lagos").toISOString(), "2026-03-10T08:00:00.000Z"); // UTC+1
  assert.equal(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z"); // DST
  assert.equal(zonedToUtc("2026-01-01", "09:00", "America/New_York").toISOString(), "2026-01-01T14:00:00.000Z");
  assert.equal(zonedToUtc("2026-03-10", "09:00", "Not/AZone").toISOString(), "2026-03-10T09:00:00.000Z"); // invalid -> UTC
  const { u, now } = await setup({ tz: "Africa/Lagos" });
  await enqueueReminders(env.db, now);
  const r = await rows(u.id, "and ref_key like '%:2:%'"); // the 24h lead is correctly skipped here: in Lagos it was already >30 min in the past
  // the stored deadline wall-clock time is UTC-ish digits; in Lagos that instant is 1h earlier
  const [dueDate, dueTime] = (await env.db.query("select due_date, due_time from tasks where user_id = $1", [u.id])).rows.map((x) => [x.due_date, x.due_time])[0];
  assert.equal(new Date(r[0].send_at).getTime(), zonedToUtc(dueDate, dueTime, "Africa/Lagos").getTime() - 2 * 3600_000);
  assert.equal((await rows(u.id, "and ref_key like '%:24:%'")).length, 0);
});

test("rescheduling or completing a task cancels stale reminders and creates new ones", opts, async () => {
  setEmailTransport(async () => ({ ok: true }));
  const { c, u, task, now } = await setup();
  await enqueueReminders(env.db, now);
  const later = new Date(now.getTime() + 36 * 3600_000);
  await c.patch(`/tasks/${task.id}`, { dueDate: ymd(later), dueTime: hm(later) });
  const r = await enqueueReminders(env.db, now);
  assert.ok(r.superseded >= 2);
  assert.ok((await rows(u.id, "and status = 'skipped' and last_error = 'superseded'")).length >= 2);
  await c.patch(`/tasks/${task.id}`, { status: "completed" });
  await enqueueReminders(env.db, now);
  assert.equal((await rows(u.id, "and status = 'pending'")).length, 0);
});

test("failures are retried with a lease, then marked failed; nothing is claimed twice", opts, async () => {
  let calls = 0; setEmailTransport(async () => { calls++; throw new Error("provider down"); });
  const { u, now } = await setup();
  await enqueueReminders(env.db, now);
  let t = now;
  for (let i = 0; i < 6; i++) { await dispatchReminders(env.db, t); t = new Date(t.getTime() + 11 * 60_000); }
  const r = (await rows(u.id)).find((x) => x.ref_key.includes(":24:"));
  assert.equal(r.status, "failed"); assert.equal(r.attempts, 5); assert.match(r.last_error, /provider down/);
  assert.equal(calls, 5);
  // lease: an immediate second dispatch does not re-send a row that was just claimed
  const before = calls;
  const { u: u2, now: n2 } = await setup(); setEmailTransport(async () => { calls++; throw new Error("x"); });
  await enqueueReminders(env.db, n2);
  await dispatchReminders(env.db, n2); await dispatchReminders(env.db, n2);
  assert.equal(calls - before, 1);
  assert.ok(u2);
});

test("HONESTY: with no email provider configured reminders are skipped, never marked sent", opts, async () => {
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  const { u, now } = await setup();
  await enqueueReminders(env.db, now);
  const out = await dispatchReminders(env.db, now);
  assert.equal(out.sent, 0); assert.equal(out.skipped, 1);
  const r = (await rows(u.id)).find((x) => x.status === "skipped");
  assert.equal(r.last_error, "email_not_configured"); assert.equal(r.sent_at, null);
});

test("push: needs a subscription, delivers via transport, prunes expired subscriptions", opts, async () => {
  const pushes = []; setPushTransport(async (sub, payload) => { pushes.push([sub.endpoint, payload]); return sub.endpoint.includes("gone") ? { gone: true } : { ok: true }; });
  const { c, u, now } = await setup({ email: false, push: true });
  await enqueueReminders(env.db, now);
  assert.equal((await rows(u.id)).length, 0); // no device subscribed -> no push reminders queued
  assert.equal((await c.post("/push/subscribe", { endpoint: "http://insecure.example/x", keys: { p256dh: "a", auth: "b" } })).status, 400);
  assert.equal((await c.post("/push/subscribe", { endpoint: "https://push.example/live-1", keys: { p256dh: "a", auth: "b" } })).status, 201);
  await enqueueReminders(env.db, now);
  assert.equal((await dispatchReminders(env.db, now)).sent, 1);
  assert.equal(pushes[0][0], "https://push.example/live-1"); assert.match(pushes[0][1].title, /Final exam/);
  const status = (await c.get("/reminders/status")).data;
  assert.equal(status.push.devices, 1); assert.equal(status.upcoming.length, 1);
  await c.post("/push/subscribe", { endpoint: "https://push.example/gone-2", keys: { p256dh: "a", auth: "b" } });
  await c.post("/reminders/test", { channel: "push" });
  assert.equal((await c.get("/reminders/status")).data.push.devices, 1); // expired one removed
  assert.equal((await c.post("/push/unsubscribe", { endpoint: "https://push.example/live-1" })).status, 204);
  assert.equal((await c.get("/reminders/status")).data.push.devices, 0);
});

test("push subscribe limits devices and ownership follows the signed-in user", opts, async () => {
  const a = await user(), b = await user();
  for (let i = 0; i < 10; i++) assert.equal((await a.c.post("/push/subscribe", { endpoint: `https://p.example/${i}`, keys: { p256dh: "a", auth: "b" } })).status, 201);
  assert.equal((await a.c.post("/push/subscribe", { endpoint: "https://p.example/11", keys: { p256dh: "a", auth: "b" } })).status, 400);
  await b.c.post("/push/subscribe", { endpoint: "https://p.example/0", keys: { p256dh: "x", auth: "y" } });
  assert.equal((await a.c.get("/reminders/status")).data.push.devices, 9);
  assert.equal((await b.c.get("/reminders/status")).data.push.devices, 1);
});

test("test-send is honest when a channel is not configured, and sends when it is", opts, async () => {
  const { c } = await user();
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  assert.equal((await c.post("/reminders/test", { channel: "email" })).data.status, "not_configured");
  assert.equal((await c.post("/reminders/test", { channel: "push" })).data.status, "not_configured");
  const sent = []; setEmailTransport(async (m) => { sent.push(m); return { ok: true }; });
  assert.equal((await c.post("/reminders/test", { channel: "email" })).data.status, "sent");
  assert.equal(sent.length, 1);
  setEmailTransport(async () => { throw new Error("boom"); });
  assert.equal((await c.post("/reminders/test", { channel: "email" })).status, 502);
});

test("daily digest summarises the real workload once per local day", opts, async () => {
  const zones = Array.from({ length: 27 }, (_, i) => `Etc/GMT${i - 13 < 0 ? "-" : "+"}${Math.abs(i - 13)}`).filter((z) => !z.endsWith("+0") && !z.endsWith("-0") && /GMT[+-](1[0-2]|[0-9])$/.test(z));
  const tz = zones.find((z) => { const h = wallClockNow(z).getHours(); return h >= 8 && h <= 10; }) ?? zones.find((z) => wallClockNow(z).getHours() === 7);
  assert.ok(tz, "found a timezone where it is morning");
  const sent = []; setEmailTransport(async (m) => { sent.push(m); return { ok: true }; });
  const { c, u, now } = await setup({ tz });
  await c.put("/preferences", { dailyDigest: true });
  await enqueueReminders(env.db, now);
  await dispatchReminders(env.db, now);
  assert.ok(sent.some((m) => /^Today: workload/.test(m.subject)), sent.map((m) => m.subject).join(" | "));
  const before = (await rows(u.id, "and kind = 'digest'")).length;
  await enqueueReminders(env.db, now);
  assert.equal((await rows(u.id, "and kind = 'digest'")).length, before); // one per day per channel
});

test("cron endpoints require the secret (constant-time), are not open when unset, and run the jobs", opts, async () => {
  const anon = client(env.db, "6.6.6.6");
  assert.equal((await anon.get("/cron/reminders")).status, 503); // CRON_SECRET unset
  process.env.CRON_SECRET = "s3cret-value";
  assert.equal((await anon.get("/cron/reminders")).status, 401);
  assert.equal((await anon.get("/cron/reminders", { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await anon.get("/cron/snapshots")).status, 401);
  const sent = []; setEmailTransport(async (m) => { sent.push(m); return { ok: true }; });
  const { u } = await setup();
  const ok = await anon.get("/cron/reminders", { authorization: "Bearer s3cret-value" });
  assert.equal(ok.status, 200); assert.ok(ok.data.enqueued.created >= 2); assert.ok(sent.length >= 1);
  const snap = await anon.post("/cron/snapshots", {}, { authorization: "Bearer s3cret-value" });
  assert.equal(snap.status, 200); assert.ok(snap.data.ok >= 1);
  assert.equal((await env.db.query("select count(*)::int as n from workload_snapshots where user_id = $1", [u.id])).rows[0].n, 1);
});

test("account export contains only your own data; deletion needs the password and removes everything", opts, async () => {
  const a = await user(), b = await user();
  const course = (await a.c.post("/courses", { code: "EXP1", name: "Export" })).data;
  await a.c.post("/tasks", { courseId: course.id, title: "Mine", type: "test", dueDate: "2099-01-01" });
  await b.c.post("/courses", { code: "OTHER", name: "Other's" });
  const ex = await a.c.get("/account/export");
  assert.equal(ex.status, 200);
  const text = JSON.stringify(ex.data);
  assert.match(ex.headers.get("content-disposition"), /^attachment/);
  const json = JSON.parse(text);
  assert.equal(json.tasks.length, 1); assert.equal(json.courses[0].code, "EXP1");
  assert.ok(!/password|OTHER|Other's/.test(text));
  assert.equal((await a.c.raw("DELETE", "/account", { password: "wrong-password" })).status, 400);
  assert.equal((await a.c.get("/auth/me")).status, 200);
  assert.equal((await a.c.raw("DELETE", "/account", { password: a.u.password })).status, 204);
  assert.equal((await a.c.get("/auth/me")).status, 401);
  for (const t of ["courses", "tasks", "preferences", "sessions"]) assert.equal((await env.db.query(`select count(*)::int as n from ${t} where user_id = $1`, [a.u.id])).rows[0].n, 0, t);
  assert.equal((await env.db.query("select count(*)::int as n from users where id = $1", [a.u.id])).rows[0].n, 0);
  assert.equal((await b.c.get("/courses")).data.items.length, 1); // other users untouched
});
