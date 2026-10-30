import { route } from "../router.js";
import { Fields, HttpError, isPlainObject, isUuid, Reply } from "../http.js";
import { notification, warning } from "../serialize.js";

route("GET", "/warnings", async (ctx) => {
  const status = ctx.query.status;
  const args = [ctx.user.id];
  let extra = "and (status <> 'resolved' or updated_at > now() - interval '30 days')";
  if (status) { if (!["active", "dismissed", "resolved"].includes(status)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid status."); args.push(status); extra = "and status = $2"; }
  const { rows } = await ctx.db.query(`select * from warnings where user_id = $1 ${extra} order by updated_at desc limit 500`, args);
  return { items: rows.map(warning), nextCursor: null };
});

function warningFields(w) {
  if (!isPlainObject(w)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid warning.");
  const f = new Fields().str("key", w.key, { max: 200 }).str("code", w.code, { max: 60 }).enum("severity", w.severity, ["info", "warning", "critical"])
    .str("title", w.title, { max: 300 }).str("why", w.why, { max: 1000 }).str("nextStep", w.nextStep ?? "", { min: 0, max: 500 })
    .str("actionBy", w.actionBy, { max: 40, nullable: true, optional: true });
  const v = f.done();
  v.courseId = isUuid(w.courseId) ? w.courseId : null;
  v.taskIds = Array.isArray(w.taskIds) ? w.taskIds.filter(isUuid).slice(0, 100) : [];
  return v;
}

// Applies the output of the engine's reconcileWarnings() atomically. Unique (user, key) prevents duplicates.
route("POST", "/warnings/sync", async (ctx) => {
  const b = await ctx.json();
  for (const k of ["toCreate", "toUpdate", "toResolve"]) if (b[k] !== undefined && (!Array.isArray(b[k]) || b[k].length > 200)) throw new HttpError(400, "VALIDATION_ERROR", `${k} must be a list of up to 200 items.`);
  const upsert = async (q, v, reactivate) => q.query(
    `insert into warnings (user_id, key, code, severity, title, why, course_id, task_ids, action_by, next_step)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (user_id, key) do update set code = excluded.code, severity = excluded.severity, title = excluded.title, why = excluded.why,
        course_id = excluded.course_id, task_ids = excluded.task_ids, action_by = excluded.action_by, next_step = excluded.next_step,
        status = case when $11::boolean then 'active' else warnings.status end, dismissed_severity = case when $11::boolean then null else warnings.dismissed_severity end, updated_at = now()`,
    [ctx.user.id, v.key, v.code, v.severity, v.title, v.why, v.courseId, v.taskIds, v.actionBy ?? null, v.nextStep ?? "", reactivate]);
  await ctx.db.tx(async (q) => {
    for (const w of b.toCreate ?? []) await upsert(q, warningFields(w), false);
    for (const w of b.toUpdate ?? []) await upsert(q, warningFields(w), true);
    const keys = (b.toResolve ?? []).filter((k) => typeof k === "string" && k.length <= 200);
    if (keys.length) await q.query("update warnings set status = 'resolved', updated_at = now() where user_id = $1 and key = any($2::text[]) and status <> 'resolved'", [ctx.user.id, keys]);
  });
  return { ok: true };
});

route("POST", "/warnings/:id/dismiss", async (ctx) => {
  const { rows } = await ctx.db.query("update warnings set status = 'dismissed', dismissed_severity = severity, updated_at = now() where id = $1 and user_id = $2 returning *", [ctx.params.id, ctx.user.id]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Warning not found.");
  return warning(rows[0]);
});

route("POST", "/warnings/:id/read", async (ctx) => {
  const { rows } = await ctx.db.query("update warnings set read_at = coalesce(read_at, now()), updated_at = now() where id = $1 and user_id = $2 returning *", [ctx.params.id, ctx.user.id]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Warning not found.");
  return warning(rows[0]);
});

// Server-originated notifications (course rep date changes, etc.)
route("GET", "/notifications", async (ctx) => {
  const { rows } = await ctx.db.query("select * from notifications where user_id = $1 order by created_at desc limit 100", [ctx.user.id]);
  return { items: rows.map(notification), nextCursor: null };
});
route("POST", "/notifications/read-all", async (ctx) => {
  await ctx.db.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [ctx.user.id]);
  return new Reply(204);
});
route("POST", "/notifications/:id/read", async (ctx) => {
  const { rows } = await ctx.db.query("update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning *", [ctx.params.id, ctx.user.id]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Notification not found.");
  return notification(rows[0]);
});
