import { route } from "../router.js";
import { Fields, HttpError } from "../http.js";
import { preferences } from "../serialize.js";
import { validTimeZone } from "../time.js";

route("GET", "/preferences", async (ctx) => {
  const { rows } = await ctx.db.query("select * from preferences where user_id = $1", [ctx.user.id]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "No preferences saved yet.");
  return preferences(rows[0]);
});

route("PUT", "/preferences", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields()
    .num("dailyStudyHours", b.dailyStudyHours, { min: 0, max: 16, optional: true })
    .int("maxSessionMinutes", b.maxSessionMinutes, { min: 30, max: 240, optional: true })
    .int("breakMinutes", b.breakMinutes, { min: 0, max: 60, optional: true })
    .time("preferredStartTime", b.preferredStartTime, { optional: true, nullable: false })
    .bool("emailReminders", b.emailReminders, { optional: true })
    .bool("pushReminders", b.pushReminders, { optional: true })
    .bool("sessionReminders", b.sessionReminders, { optional: true })
    .bool("dailyDigest", b.dailyDigest, { optional: true });
  if (b.availableDays !== undefined) {
    if (!Array.isArray(b.availableDays) || b.availableDays.length > 7 || !b.availableDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) f.fail("availableDays", "Choose days from Sunday to Saturday");
    else f.values.availableDays = [...new Set(b.availableDays)].sort();
  }
  if (b.deadlineLeadHours !== undefined) {
    if (!Array.isArray(b.deadlineLeadHours) || b.deadlineLeadHours.length > 4 || !b.deadlineLeadHours.every((h) => Number.isInteger(h) && h >= 1 && h <= 168)) f.fail("deadlineLeadHours", "Use up to 4 lead times between 1 and 168 hours");
    else f.values.deadlineLeadHours = [...new Set(b.deadlineLeadHours)].sort((a, c) => c - a);
  }
  if (b.timezone !== undefined) {
    if (!validTimeZone(b.timezone)) f.fail("timezone", "Unknown time zone"); else f.values.timezone = b.timezone;
  }
  const v = f.done();
  const cur = (await ctx.db.query("select * from preferences where user_id = $1", [ctx.user.id])).rows[0];
  const pick = (k, col) => (v[k] !== undefined ? v[k] : cur?.[col]);
  const row = await ctx.db.query(
    `insert into preferences (user_id, daily_study_hours, available_days, max_session_minutes, break_minutes, preferred_start_time, timezone,
        email_reminders, push_reminders, deadline_lead_hours, session_reminders, daily_digest)
     values ($1, coalesce($2::numeric, 3), coalesce($3::smallint[], '{0,1,2,3,4,5,6}'::smallint[]), coalesce($4::int, 90), coalesce($5::int, 10),
        coalesce($6::time, '18:00'::time), coalesce($7::text, 'UTC'), coalesce($8::boolean, false), coalesce($9::boolean, false),
        coalesce($10::int[], '{24,2}'::int[]), coalesce($11::boolean, true), coalesce($12::boolean, false))
     on conflict (user_id) do update set daily_study_hours = excluded.daily_study_hours, available_days = excluded.available_days,
        max_session_minutes = excluded.max_session_minutes, break_minutes = excluded.break_minutes, preferred_start_time = excluded.preferred_start_time,
        timezone = excluded.timezone, email_reminders = excluded.email_reminders, push_reminders = excluded.push_reminders,
        deadline_lead_hours = excluded.deadline_lead_hours, session_reminders = excluded.session_reminders, daily_digest = excluded.daily_digest, updated_at = now()
     returning *`,
    [ctx.user.id, pick("dailyStudyHours", "daily_study_hours"), pick("availableDays", "available_days"), pick("maxSessionMinutes", "max_session_minutes"),
      pick("breakMinutes", "break_minutes"), pick("preferredStartTime", "preferred_start_time"), pick("timezone", "timezone"),
      pick("emailReminders", "email_reminders"), pick("pushReminders", "push_reminders"), pick("deadlineLeadHours", "deadline_lead_hours"),
      pick("sessionReminders", "session_reminders"), pick("dailyDigest", "daily_digest")],
  );
  return preferences(row.rows[0]);
});
