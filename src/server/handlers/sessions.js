import { route } from "../router.js";
import { Fields, HttpError, isUuid, rateLimit, Reply } from "../http.js";
import { session } from "../serialize.js";

route("GET", "/study-sessions", async (ctx) => {
  const q = ctx.query;
  const where = ["user_id = $1"]; const args = [ctx.user.id];
  if (q.from) { args.push(q.from); where.push(`date >= $${args.length}::date`); }
  if (q.to) { args.push(q.to); where.push(`date <= $${args.length}::date`); }
  if (q.taskId) { if (!isUuid(q.taskId)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid task filter."); args.push(q.taskId); where.push(`task_id = $${args.length}`); }
  const { rows } = await ctx.db.query(`select * from study_sessions where ${where.join(" and ")} order by starts_at limit 2000`, args);
  return { items: rows.map(session), nextCursor: null };
});

route("PATCH", "/study-sessions/:id", async (ctx) => {
  const b = await ctx.json();
  const v = new Fields().enum("status", b.status, ["planned", "completed", "skipped"]).done();
  const { rows } = await ctx.db.query(
    `update study_sessions set status = $3, completed_at = case when $3 = 'completed' then now() else null end, updated_at = now()
      where id = $1 and user_id = $2 returning *`, [ctx.params.id, ctx.user.id, v.status]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Session not found.");
  return session(rows[0]);
});

route("DELETE", "/study-sessions/:id", async (ctx) => {
  const r = await ctx.db.query("delete from study_sessions where id = $1 and user_id = $2", [ctx.params.id, ctx.user.id]);
  if (!r.rowCount) throw new HttpError(404, "NOT_FOUND", "Session not found.");
  return new Reply(204);
});

const LOCAL = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

// Atomically replaces every non-completed session with the supplied plan; completed ones are untouched.
route("PUT", "/study-sessions/plan", async (ctx) => {
  await rateLimit(ctx.db, `plan:${ctx.user.id}`, 30, 60);
  const b = await ctx.json();
  if (!Array.isArray(b.sessions) || b.sessions.length > 500) throw new HttpError(400, "VALIDATION_ERROR", "Send up to 500 sessions.", { sessions: "Invalid sessions" });
  const rows = [];
  for (const [i, s] of b.sessions.entries()) {
    const f = new Fields().uuid("taskId", s?.taskId).date("date", s?.date).str("reason", s?.reason ?? "", { min: 0, max: 500 });
    const a = LOCAL.exec(s?.startsAt ?? ""), e = LOCAL.exec(s?.endsAt ?? "");
    if (!a || !e) f.fail("startsAt", "Use YYYY-MM-DDTHH:mm");
    f.values.index = i;
    let v;
    try { v = f.done(); } catch (err) { err.fields = { [`sessions[${i}]`]: Object.values(err.fields)[0] }; throw err; }
    const start = Date.UTC(+a[1].slice(0, 4), +a[1].slice(5, 7) - 1, +a[1].slice(8), +a[2], +a[3]);
    const end = Date.UTC(+e[1].slice(0, 4), +e[1].slice(5, 7) - 1, +e[1].slice(8), +e[2], +e[3]);
    if (!(end > start) || a[1] !== v.date) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { [`sessions[${i}]`]: "Session times are inconsistent" });
    rows.push({ taskId: v.taskId, date: v.date, startsAt: `${a[1]} ${a[2]}:${a[3]}`, endsAt: `${e[1]} ${e[2]}:${e[3]}`, minutes: Math.round((end - start) / 60000), reason: v.reason ?? "" });
  }
  const count = await ctx.db.tx(async (q) => {
    const ids = [...new Set(rows.map((r) => r.taskId))];
    const tasks = (await q.query("select id, course_id, status from tasks where user_id = $1 and id = any($2::uuid[]) for share", [ctx.user.id, ids])).rows;
    if (tasks.length !== ids.length) throw new HttpError(400, "VALIDATION_ERROR", "Some tasks were not found.", { sessions: "Unknown task" });
    if (tasks.some((t) => t.status === "completed")) throw new HttpError(400, "VALIDATION_ERROR", "Completed tasks cannot be planned.", { sessions: "Task already completed" });
    const courseOf = new Map(tasks.map((t) => [t.id, t.course_id]));
    await q.query("delete from study_sessions where user_id = $1 and status <> 'completed'", [ctx.user.id]);
    if (rows.length) {
      await q.query(
        `insert into study_sessions (user_id, task_id, course_id, date, starts_at, ends_at, minutes, reason)
         select $1, * from unnest($2::uuid[], $3::uuid[], $4::date[], $5::timestamp[], $6::timestamp[], $7::int[], $8::text[])`,
        [ctx.user.id, rows.map((r) => r.taskId), rows.map((r) => courseOf.get(r.taskId)), rows.map((r) => r.date), rows.map((r) => r.startsAt), rows.map((r) => r.endsAt), rows.map((r) => r.minutes), rows.map((r) => r.reason)],
      );
    }
    return rows.length;
  });
  return { count };
});
