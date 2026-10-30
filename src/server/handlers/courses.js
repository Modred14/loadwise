import { route } from "../router.js";
import { Fields, HttpError, isUuid, Reply } from "../http.js";
import { course } from "../serialize.js";
import { adoptSharedForCourse } from "../sharing.js";

async function checkCatalog(q, user, catalogId) {
  if (!catalogId) return;
  const { rows } = await q.query("select department_id from course_catalog where id = $1", [catalogId]);
  if (!rows[0] || !user.departmentId || rows[0].department_id !== user.departmentId) {
    throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { catalogId: "Choose a course from your department" });
  }
}

route("GET", "/courses", async (ctx) => {
  const { rows } = await ctx.db.query("select * from courses where user_id = $1 order by rank nulls last, lower(code)", [ctx.user.id]);
  return { items: rows.map(course), nextCursor: null };
});

route("POST", "/courses", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields().str("code", b.code, { max: 20, label: "Course code" }).str("name", b.name, { max: 160, label: "Course name" })
    .int("priority", b.priority ?? 3, { min: 1, max: 5 });
  if (b.catalogId) f.uuid("catalogId", b.catalogId);
  const v = f.done();
  const out = await ctx.db.tx(async (q) => {
    await checkCatalog(q, ctx.user, v.catalogId);
    let row;
    try {
      row = (await q.query("insert into courses (user_id, code, name, priority, catalog_id) values ($1,$2,$3,$4,$5) returning *", [ctx.user.id, v.code, v.name, v.priority, v.catalogId ?? null])).rows[0];
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "CONFLICT", "A course with this code already exists.", { code: "Already exists" });
      throw e;
    }
    if (v.catalogId) await adoptSharedForCourse(q, ctx.user.id, row.id, v.catalogId);
    return row;
  });
  return new Reply(201, course(out));
});

route("PATCH", "/courses/:id", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields().str("code", b.code, { max: 20, optional: true, label: "Course code" }).str("name", b.name, { max: 160, optional: true, label: "Course name" })
    .int("priority", b.priority, { min: 1, max: 5, optional: true });
  if (b.catalogId !== undefined) f.uuid("catalogId", b.catalogId, { nullable: true });
  if (b.color !== undefined) { if (b.color === null || /^#[0-9a-fA-F]{6}$/.test(b.color)) f.values.color = b.color; else f.fail("color", "Use a hex colour like #2c5aa0"); }
  const v = f.done();
  const row = await ctx.db.tx(async (q) => {
    const cur = (await q.query("select * from courses where id = $1 and user_id = $2 for update", [ctx.params.id, ctx.user.id])).rows[0];
    if (!cur) throw new HttpError(404, "NOT_FOUND", "Course not found.");
    if (b.catalogId !== undefined) await checkCatalog(q, ctx.user, v.catalogId);
    let upd;
    try {
      upd = (await q.query(
        `update courses set code = coalesce($3, code), name = coalesce($4, name), priority = coalesce($5, priority),
            catalog_id = case when $6::boolean then $7 else catalog_id end, color = case when $8::boolean then $9 else color end, updated_at = now()
          where id = $1 and user_id = $2 returning *`,
        [ctx.params.id, ctx.user.id, v.code ?? null, v.name ?? null, v.priority ?? null, b.catalogId !== undefined, v.catalogId ?? null, b.color !== undefined, v.color ?? null],
      )).rows[0];
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "CONFLICT", "A course with this code already exists.", { code: "Already exists" });
      throw e;
    }
    if (v.catalogId && v.catalogId !== cur.catalog_id) await adoptSharedForCourse(q, ctx.user.id, upd.id, v.catalogId);
    if (b.catalogId !== undefined && !v.catalogId) await q.query("update tasks set shared_deadline_id = null where course_id = $1 and user_id = $2", [upd.id, ctx.user.id]);
    return upd;
  });
  return course(row);
});

// Course priority ranking: drag/reorder UI sends the full order; rank 1 gets priority 5, the last gets 1.
route("PUT", "/courses/ranking", async (ctx) => {
  const b = await ctx.json();
  if (!Array.isArray(b.order) || b.order.length > 100 || !b.order.every(isUuid) || new Set(b.order).size !== b.order.length) {
    throw new HttpError(400, "VALIDATION_ERROR", "Send an ordered list of your course ids.", { order: "Invalid order" });
  }
  await ctx.db.tx(async (q) => {
    const owned = await q.query("select id from courses where user_id = $1 and id = any($2::uuid[])", [ctx.user.id, b.order]);
    if (owned.rowCount !== b.order.length) throw new HttpError(400, "VALIDATION_ERROR", "Some courses were not found.", { order: "Unknown course" });
    await q.query("update courses set rank = null where user_id = $1", [ctx.user.id]);
    const n = b.order.length;
    for (let i = 0; i < n; i++) {
      const priority = n === 1 ? 3 : Math.round(5 - (4 * i) / (n - 1));
      await q.query("update courses set rank = $3, priority = $4, updated_at = now() where id = $1 and user_id = $2", [b.order[i], ctx.user.id, i + 1, priority]);
    }
  });
  const { rows } = await ctx.db.query("select * from courses where user_id = $1 order by rank nulls last, lower(code)", [ctx.user.id]);
  return { items: rows.map(course), nextCursor: null };
});

route("DELETE", "/courses/:id", async (ctx) => {
  const cascade = ctx.query.cascade === "true";
  await ctx.db.tx(async (q) => {
    const cur = (await q.query("select id from courses where id = $1 and user_id = $2 for update", [ctx.params.id, ctx.user.id])).rows[0];
    if (!cur) throw new HttpError(404, "NOT_FOUND", "Course not found.");
    const n = (await q.query("select count(*)::int as n from tasks where course_id = $1", [ctx.params.id])).rows[0].n;
    if (n > 0 && !cascade) throw new HttpError(409, "HAS_TASKS", "This course still has tasks. Delete them first or confirm deleting everything.");
    // remember adopted shared tasks that are being deleted so they are not re-created on the next sync
    await q.query(
      `insert into shared_dismissals (user_id, shared_deadline_id) select user_id, shared_deadline_id from tasks where course_id = $1 and shared_deadline_id is not null on conflict do nothing`, [ctx.params.id]);
    await q.query("delete from courses where id = $1 and user_id = $2", [ctx.params.id, ctx.user.id]);
  });
  return new Reply(204);
});
