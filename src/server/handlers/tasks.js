import { route } from "../router.js";
import { Fields, HttpError, TASK_TYPES, clampInt, isUuid, likeEscape, Reply } from "../http.js";
import { task } from "../serialize.js";

const STUDIED = `coalesce((select sum(s.minutes) from study_sessions s where s.task_id = t.id and s.status = 'completed'), 0) / 60.0`;

route("GET", "/tasks", async (ctx) => {
  const q = ctx.query;
  const where = ["t.user_id = $1"];
  const args = [ctx.user.id];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (q.courseId) { if (!isUuid(q.courseId)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid course filter."); add("t.course_id = ?", q.courseId); }
  if (q.type) { if (!TASK_TYPES.includes(q.type)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid type filter."); add("t.type = ?", q.type); }
  if (q.status) { if (!["todo", "in_progress", "completed"].includes(q.status)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid status filter."); add("t.status = ?", q.status); }
  if (q.from) add("t.due_date >= ?::date", q.from);
  if (q.to) add("t.due_date <= ?::date", q.to);
  if (q.q) add("(t.title ilike ? or t.description ilike ?)", `%${likeEscape(String(q.q).slice(0, 100))}%`);
  const limit = clampInt(q.limit, 1000, 1, 1000);
  const offset = clampInt(q.cursor, 0, 0, 1_000_000);
  const sql = where.join(" and ");
  const { rows } = await ctx.db.query(
    `select t.*, ${STUDIED} as studied_hours from tasks t where ${sql} order by t.due_date, t.due_time nulls last, t.id limit ${limit + 1} offset ${offset}`, args);
  return { items: rows.slice(0, limit).map(task), nextCursor: rows.length > limit ? String(offset + limit) : null };
});

function taskFields(b, { partial }) {
  const o = { optional: partial };
  const f = new Fields().str("title", b.title, { max: 160, label: "Title", ...o }).enum("type", b.type, TASK_TYPES, o).date("dueDate", b.dueDate, o)
    .time("dueTime", b.dueTime, { optional: partial }).num("estimatedHours", b.estimatedHours, { min: 0.5, max: 200, nullable: true, optional: true })
    .int("importance", b.importance, { min: 1, max: 5, optional: true }).enum("status", b.status, ["todo", "in_progress", "completed"], { optional: true });
  if (b.description !== undefined) f.str("description", b.description ?? "", { min: 0, max: 1000 });
  if (!partial) f.uuid("courseId", b.courseId); else if (b.courseId !== undefined) f.uuid("courseId", b.courseId);
  return f.done();
}

route("POST", "/tasks", async (ctx) => {
  const v = taskFields(await ctx.json(), { partial: false });
  const own = await ctx.db.query("select 1 from courses where id = $1 and user_id = $2", [v.courseId, ctx.user.id]);
  if (!own.rowCount) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { courseId: "Unknown course" });
  const done = v.status === "completed";
  const { rows } = await ctx.db.query(
    `insert into tasks (user_id, course_id, title, description, type, due_date, due_time, estimated_hours, importance, status, completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $11 then now() end) returning *`,
    [ctx.user.id, v.courseId, v.title, v.description ?? "", v.type, v.dueDate, v.dueTime ?? null, v.estimatedHours ?? null, v.importance ?? 3, v.status ?? "todo", done],
  );
  return new Reply(201, task(rows[0]));
});

route("PATCH", "/tasks/:id", async (ctx) => {
  const b = await ctx.json();
  const v = taskFields(b, { partial: true });
  const out = await ctx.db.tx(async (q) => {
    const cur = (await q.query("select * from tasks where id = $1 and user_id = $2 for update", [ctx.params.id, ctx.user.id])).rows[0];
    if (!cur) throw new HttpError(404, "NOT_FOUND", "Task not found.");
    if (b.version !== undefined && Number(b.version) !== cur.version) throw new HttpError(409, "STALE", "This task was changed elsewhere. Refresh and try again.");
    if (cur.shared_deadline_id) {
      const changed = (v.title !== undefined && v.title !== cur.title) || (v.type !== undefined && v.type !== cur.type) ||
        (v.dueDate !== undefined && v.dueDate !== cur.due_date) || (v.dueTime !== undefined && (v.dueTime ?? null) !== (cur.due_time ?? null)) ||
        (v.courseId !== undefined && v.courseId !== cur.course_id);
      if (changed) throw new HttpError(403, "SHARED_LOCKED", "This deadline is managed by your course rep. You can change your preparation time, importance and status.");
    }
    if (v.courseId) {
      const own = await q.query("select 1 from courses where id = $1 and user_id = $2", [v.courseId, ctx.user.id]);
      if (!own.rowCount) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { courseId: "Unknown course" });
    }
    const has = (k) => b[k] !== undefined;
    const nextStatus = v.status ?? cur.status;
    const completing = nextStatus === "completed" && cur.status !== "completed";
    const reopening = nextStatus !== "completed" && cur.status === "completed";
    const { rows } = await q.query(
      `update tasks set course_id = coalesce($3, course_id), title = coalesce($4, title), description = case when $5::boolean then $6 else description end,
          type = coalesce($7, type), due_date = coalesce($8, due_date), due_time = case when $9::boolean then $10 else due_time end,
          estimated_hours = case when $11::boolean then $12 else estimated_hours end, importance = coalesce($13, importance), status = $14,
          completed_at = case when $15 then now() when $16 then null else completed_at end, version = version + 1, updated_at = now()
        where id = $1 and user_id = $2 returning *`,
      [ctx.params.id, ctx.user.id, v.courseId ?? null, v.title ?? null, has("description"), v.description ?? "", v.type ?? null, v.dueDate ?? null,
        has("dueTime"), v.dueTime ?? null, has("estimatedHours"), v.estimatedHours ?? null, v.importance ?? null, nextStatus, completing, reopening],
    );
    const t = rows[0];
    const planRelevant = (v.dueDate !== undefined && v.dueDate !== cur.due_date) || (has("dueTime") && (v.dueTime ?? null) !== (cur.due_time ?? null)) || (has("estimatedHours") && (v.estimatedHours ?? null) !== (cur.estimated_hours ?? null));
    const stale = planRelevant ? (await q.query("select 1 from study_sessions where task_id = $1 and status = 'planned' limit 1", [t.id])).rowCount > 0 : false;
    const studied = (await q.query(`select ${STUDIED} as s from tasks t where t.id = $1`, [t.id])).rows[0].s;
    return { ...task({ ...t, studied_hours: studied }), planStale: stale };
  });
  return out;
});

route("DELETE", "/tasks/:id", async (ctx) => {
  await ctx.db.tx(async (q) => {
    const { rows } = await q.query("delete from tasks where id = $1 and user_id = $2 returning shared_deadline_id", [ctx.params.id, ctx.user.id]);
    if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Task not found.");
    if (rows[0].shared_deadline_id) await q.query("insert into shared_dismissals (user_id, shared_deadline_id) values ($1,$2) on conflict do nothing", [ctx.user.id, rows[0].shared_deadline_id]);
  });
  return new Reply(204);
});
