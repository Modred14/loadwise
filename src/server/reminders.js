// Reminder outbox: enqueue (deduplicated) -> dispatch (leased, retried) -> real email / push.
import { loadUserData, workloadFor } from "./workload.js";
import { localDateKey, wallClockNow, zonedToUtc } from "./time.js";
import { sendEmail } from "./email.js";
import { pushConfigured, sendPush } from "./push.js";

const HOUR = 3_600_000;
const MAX_ATTEMPTS = 5;
const leadLabel = (h) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`);
const hhmm = (v) => (v ? v.slice(0, 5) : null);

/** Creates any reminders that should exist right now. Safe to run repeatedly: (user, channel, ref_key) is unique. */
export async function enqueueReminders(db, at = new Date()) {
  const users = (await db.query(
    `select u.id, u.email, u.name, p.timezone, p.email_reminders, p.push_reminders, p.deadline_lead_hours, p.session_reminders, p.daily_digest,
            (select count(*)::int from push_subscriptions s where s.user_id = u.id) as subs
       from users u join preferences p on p.user_id = u.id where p.email_reminders or p.push_reminders limit 5000`)).rows;
  let created = 0, superseded = 0;
  for (const u of users) {
    const channels = [u.email_reminders && "email", u.push_reminders && u.subs > 0 && "push"].filter(Boolean);
    if (!channels.length) continue;
    const want = []; // {kind, ref, title, body, link, sendAt}
    const tasks = (await db.query(
      `select t.id, t.title, t.type, t.due_date, t.due_time, t.estimated_hours, c.code from tasks t join courses c on c.id = t.course_id
        where t.user_id = $1 and t.status <> 'completed' and t.due_date between current_date - 1 and current_date + 10`, [u.id])).rows;
    for (const t of tasks) {
      const dueUtc = zonedToUtc(t.due_date, hhmm(t.due_time) ?? "23:59", u.timezone);
      const refUtc = zonedToUtc(t.due_date, hhmm(t.due_time) ?? "09:00", u.timezone); // no time set: remind relative to 09:00 that day
      if (dueUtc.getTime() <= at.getTime()) continue;
      for (const h of u.deadline_lead_hours) {
        const sendAt = new Date(refUtc.getTime() - h * HOUR);
        if (sendAt.getTime() < at.getTime() - 30 * 60_000) continue;
        want.push({ kind: "deadline", ref: `deadline:${t.id}:${h}:${t.due_date}T${hhmm(t.due_time) ?? "day"}`, sendAt,
          title: `${t.title} (${t.code}) is due in ${leadLabel(h)}`,
          body: `${t.type.replace("_", " ")} due ${t.due_date}${t.due_time ? ` at ${hhmm(t.due_time)}` : ""}${t.estimated_hours ? `. Plan about ${t.estimated_hours}h of preparation.` : "."}`, link: "/tasks" });
      }
    }
    if (u.session_reminders) {
      const sessions = (await db.query(
        `select s.id, s.starts_at, s.minutes, t.title from study_sessions s join tasks t on t.id = s.task_id
          where s.user_id = $1 and s.status = 'planned' and s.date between current_date - 1 and current_date + 2`, [u.id])).rows;
      for (const s of sessions) {
        const [d, tm] = s.starts_at.split("T");
        const sendAt = new Date(zonedToUtc(d, tm, u.timezone).getTime() - 15 * 60_000);
        if (sendAt.getTime() < at.getTime() - 10 * 60_000 || sendAt.getTime() > at.getTime() + 36 * HOUR) continue;
        want.push({ kind: "session", ref: `session:${s.id}`, sendAt, title: `Study session at ${tm}`, body: `${s.title} for ${s.minutes} minutes.`, link: "/planner" });
      }
    }
    if (u.daily_digest) {
      const now = wallClockNow(u.timezone, at);
      if (now.getHours() >= 7 && now.getHours() < 12) {
        const data = await loadUserData(db, u.id);
        const { workload: w } = workloadFor(data, at);
        if (w.counts.active > 0) {
          const key = localDateKey(now);
          const within3 = tasks.filter((t) => (zonedToUtc(t.due_date, hhmm(t.due_time) ?? "23:59", u.timezone) - at) / HOUR <= 72).length;
          want.push({ kind: "digest", ref: `digest:${key}`, sendAt: zonedToUtc(key, "07:00", u.timezone),
            title: `Today: workload ${w.categoryLabel} (${w.score}/100)`, body: `${w.counts.active} active task${w.counts.active === 1 ? "" : "s"}, ${within3} due within 3 days${w.counts.overdue ? `, ${w.counts.overdue} overdue` : ""}. ${w.insights[0]?.text ?? ""}`.trim(), link: "/dashboard" });
        }
      }
    }
    for (const ch of channels) {
      for (const r of want) {
        const ins = await db.query(
          `insert into reminders (user_id, channel, kind, ref_key, title, body, link, send_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (user_id, channel, ref_key) do nothing`,
          [u.id, ch, r.kind, r.ref, r.title, r.body, r.link, r.sendAt]);
        created += ins.rowCount;
      }
    }
    // Reminders for tasks/sessions that changed, completed or disappeared must not fire.
    const keys = want.map((r) => r.ref);
    const sup = await db.query(
      `update reminders set status = 'skipped', last_error = 'superseded' where user_id = $1 and status = 'pending' and kind in ('deadline', 'session') and not (ref_key = any($2::text[]))`, [u.id, keys]);
    superseded += sup.rowCount;
  }
  return { users: users.length, created, superseded };
}

async function deliver(db, r) {
  if (r.channel === "email") {
    const res = await sendEmail({ to: r.email, subject: r.title, text: `${r.body}\n\nOpen LoadWise: ${(process.env.APP_URL ?? "").replace(/\/$/, "")}${r.link ?? "/dashboard"}` });
    return res.skipped ? { status: "skipped", error: res.reason } : { status: "sent" };
  }
  const subs = (await db.query("select * from push_subscriptions where user_id = $1", [r.user_id])).rows;
  if (!subs.length) return { status: "skipped", error: "no_subscription" };
  if (!pushConfigured()) return { status: "skipped", error: "push_not_configured" };
  let delivered = 0, lastErr = null;
  for (const s of subs) {
    try {
      const res = await sendPush(s, { title: r.title, body: r.body, url: r.link ?? "/dashboard", tag: r.ref_key });
      if (res.gone) await db.query("delete from push_subscriptions where id = $1", [s.id]);
      else if (res.ok) { delivered++; await db.query("update push_subscriptions set last_success_at = now() where id = $1", [s.id]); }
    } catch (e) { lastErr = e.message; }
  }
  return delivered ? { status: "sent" } : lastErr ? { status: "retry", error: lastErr } : { status: "skipped", error: "subscription_expired" };
}

/** Sends everything that is due. A claimed row is leased for 10 minutes so parallel runs never double-send. */
export async function dispatchReminders(db, at = new Date()) {
  const claimed = (await db.query(
    `with due as (select id, send_at as original from reminders where status = 'pending' and send_at <= $1 and attempts < $2 order by send_at limit 200 for update skip locked),
          upd as (update reminders r set attempts = r.attempts + 1, send_at = $1::timestamptz + interval '10 minutes' from due where r.id = due.id returning r.*, due.original)
     select upd.*, u.email from upd join users u on u.id = upd.user_id`, [at, MAX_ATTEMPTS])).rows;
  const out = { sent: 0, failed: 0, skipped: 0, retrying: 0 };
  for (const r of claimed) {
    let result;
    if (at.getTime() - new Date(r.original).getTime() > 6 * HOUR) result = { status: "skipped", error: "expired" };
    else {
      try { result = await deliver(db, r); } catch (e) { result = { status: "retry", error: e.message }; }
    }
    if (result.status === "retry") {
      const dead = r.attempts >= MAX_ATTEMPTS;
      await db.query("update reminders set status = $2, last_error = $3 where id = $1", [r.id, dead ? "failed" : "pending", String(result.error).slice(0, 300)]);
      dead ? out.failed++ : out.retrying++;
    } else {
      await db.query("update reminders set status = $2, last_error = $3, sent_at = case when $2 = 'sent' then now() end where id = $1", [r.id, result.status, result.error ?? null]);
      out[result.status === "sent" ? "sent" : "skipped"]++;
    }
  }
  return out;
}

export async function housekeeping(db) {
  await db.query("delete from rate_limits where window_start < now() - interval '1 day'");
  await db.query("delete from sessions where expires_at < now()");
  await db.query("delete from password_resets where expires_at < now() - interval '1 day'");
  await db.query("delete from reminders where status <> 'pending' and created_at < now() - interval '60 days'");
}
