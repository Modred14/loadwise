// Department course catalog, course-rep assignments, and rep-managed shared deadlines.
import { route } from "../router.js";
import { Fields, HttpError, Reply, TASK_TYPES, isUuid } from "../http.js";
import { shared } from "../serialize.js";
import { fanOutShared, notifyUsers, syncSharedUpdate } from "../sharing.js";

export const MIN_COHORT = () => Math.max(2, Number(process.env.DEPT_MIN_COHORT ?? 5));
const isAdmin = (u) => u.role === "dept_admin" && u.departmentId;

async function catalogRow(q, id) {
  const r = (await q.query("select * from course_catalog where id = $1", [id])).rows[0];
  if (!r) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  return r;
}
const canManage = (u, cat) => (isAdmin(u) && u.departmentId === cat.department_id) || (u.repCatalogIds ?? []).includes(cat.id);
const requireAdmin = (u) => { if (!isAdmin(u)) throw new HttpError(403, "FORBIDDEN", "Only a department administrator can do that."); };
const sameDept = (u, cat) => u.departmentId && u.departmentId === cat.department_id;

route("GET", "/catalog", async (ctx) => {
  if (!ctx.user.departmentId) return { items: [] };
  const { rows } = await ctx.db.query(
    `select c.id, c.code, c.name from course_catalog c where c.department_id = $1 order by lower(c.code)`, [ctx.user.departmentId]);
  return { items: rows.map((r) => ({ ...r, canManage: canManage(ctx.user, { ...r, department_id: ctx.user.departmentId }) })) };
});

route("POST", "/catalog", async (ctx) => {
  requireAdmin(ctx.user);
  const b = await ctx.json();
  const v = new Fields().str("code", b.code, { max: 20, label: "Course code" }).str("name", b.name, { max: 160, label: "Course name" }).done();
  try {
    const { rows } = await ctx.db.query("insert into course_catalog (department_id, code, name) values ($1,$2,$3) returning id, code, name", [ctx.user.departmentId, v.code, v.name]);
    return new Reply(201, rows[0]);
  } catch (e) {
    if (e.code === "23505") throw new HttpError(409, "CONFLICT", "That course code already exists in your department.", { code: "Already exists" });
    throw e;
  }
});

route("PATCH", "/catalog/:id", async (ctx) => {
  requireAdmin(ctx.user);
  const cat = await catalogRow(ctx.db, ctx.params.id);
  if (!sameDept(ctx.user, cat)) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  const b = await ctx.json();
  const v = new Fields().str("code", b.code, { max: 20, optional: true }).str("name", b.name, { max: 160, optional: true }).done();
  try {
    const { rows } = await ctx.db.query("update course_catalog set code = coalesce($2, code), name = coalesce($3, name) where id = $1 returning id, code, name", [cat.id, v.code ?? null, v.name ?? null]);
    return rows[0];
  } catch (e) {
    if (e.code === "23505") throw new HttpError(409, "CONFLICT", "That course code already exists in your department.", { code: "Already exists" });
    throw e;
  }
});

route("DELETE", "/catalog/:id", async (ctx) => {
  requireAdmin(ctx.user);
  const cat = await catalogRow(ctx.db, ctx.params.id);
  if (!sameDept(ctx.user, cat)) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  await ctx.db.query("delete from course_catalog where id = $1", [cat.id]); // students' own courses stay, just unlinked
  return new Reply(204);
});

route("GET", "/catalog/:id/reps", async (ctx) => {
  requireAdmin(ctx.user);
  const cat = await catalogRow(ctx.db, ctx.params.id);
  if (!sameDept(ctx.user, cat)) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  const { rows } = await ctx.db.query("select u.id as \"userId\", u.name, u.email from course_reps r join users u on u.id = r.user_id where r.catalog_id = $1 order by u.name", [cat.id]);
  return { items: rows };
});

route("POST", "/catalog/:id/reps", async (ctx) => {
  requireAdmin(ctx.user);
  const cat = await catalogRow(ctx.db, ctx.params.id);
  if (!sameDept(ctx.user, cat)) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  const b = await ctx.json();
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const u = (await ctx.db.query("select id, name, email from users where lower(email) = $1 and department_id = $2", [email, cat.department_id])).rows[0];
  if (!u) throw new HttpError(404, "NOT_FOUND", "No student with that email is in your department.");
  await ctx.db.query("insert into course_reps (catalog_id, user_id, assigned_by) values ($1,$2,$3) on conflict do nothing", [cat.id, u.id, ctx.user.id]);
  return new Reply(201, { userId: u.id, name: u.name, email: u.email });
});

route("DELETE", "/catalog/:id/reps/:userId", async (ctx) => {
  requireAdmin(ctx.user);
  const cat = await catalogRow(ctx.db, ctx.params.id);
  if (!sameDept(ctx.user, cat)) throw new HttpError(404, "NOT_FOUND", "Course not found.");
  await ctx.db.query("delete from course_reps where catalog_id = $1 and user_id = $2", [cat.id, ctx.params.userId]);
  return new Reply(204);
});

// ---- shared deadlines ----
route("GET", "/shared-deadlines", async (ctx) => {
  if (!ctx.user.departmentId) return { items: [] };
  const args = [ctx.user.departmentId];
  let extra = "";
  if (ctx.query.catalogId) { if (!isUuid(ctx.query.catalogId)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid course."); args.push(ctx.query.catalogId); extra = "and sd.catalog_id = $2"; }
  const { rows } = await ctx.db.query(
    `select sd.*, c.code as catalog_code, c.name as catalog_name from shared_deadlines sd join course_catalog c on c.id = sd.catalog_id
      where c.department_id = $1 ${extra} and sd.due_date >= current_date - 7 order by sd.due_date, sd.due_time nulls last limit 500`, args);
  return { items: rows.map((r) => ({ ...shared(r), catalogCode: r.catalog_code, catalogName: r.catalog_name })) };
});

function sharedFields(b, partial) {
  const o = { optional: partial };
  const f = new Fields().str("title", b.title, { max: 160, label: "Title", ...o }).enum("type", b.type, TASK_TYPES, o).date("dueDate", b.dueDate, o).time("dueTime", b.dueTime, { optional: partial });
  if (b.description !== undefined) f.str("description", b.description ?? "", { min: 0, max: 1000 });
  return f;
}

const when = (d, t) => `${d}${t ? ` at ${t}` : ""}`;

route("POST", "/shared-deadlines", async (ctx) => {
  const b = await ctx.json();
  const v = sharedFields(b, false).uuid("catalogId", b.catalogId).done();
  const out = await ctx.db.tx(async (q) => {
    const cat = await catalogRow(q, v.catalogId);
    if (!canManage(ctx.user, cat)) throw new HttpError(403, "FORBIDDEN", "Only the course rep or a department administrator can add shared deadlines for this course.");
    const sd = (await q.query(
      `insert into shared_deadlines (catalog_id, title, description, type, due_date, due_time, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [cat.id, v.title, v.description ?? "", v.type, v.dueDate, v.dueTime ?? null, ctx.user.id])).rows[0];
    const users = (await fanOutShared(q, sd)).filter((id) => id !== ctx.user.id);
    await notifyUsers(q, users, { kind: "shared_deadline_added", title: `New ${v.type.replace("_", " ")} for ${cat.code}`, body: `${v.title} is due ${when(v.dueDate, v.dueTime)}. It was added to your tasks.`, link: "/tasks", data: { sharedDeadlineId: sd.id } });
    return { sd, notified: users.length };
  });
  return new Reply(201, { ...shared(out.sd), studentsNotified: out.notified });
});

route("PATCH", "/shared-deadlines/:id", async (ctx) => {
  const b = await ctx.json();
  const v = sharedFields(b, true).done();
  const out = await ctx.db.tx(async (q) => {
    const cur = (await q.query("select sd.*, c.code, c.department_id from shared_deadlines sd join course_catalog c on c.id = sd.catalog_id where sd.id = $1 for update of sd", [ctx.params.id])).rows[0];
    if (!cur || !ctx.user.departmentId || cur.department_id !== ctx.user.departmentId) throw new HttpError(404, "NOT_FOUND", "Deadline not found.");
    if (!canManage(ctx.user, { id: cur.catalog_id, department_id: cur.department_id })) throw new HttpError(403, "FORBIDDEN", "Only the course rep or a department administrator can change this deadline.");
    if (b.version !== undefined && Number(b.version) !== cur.version) throw new HttpError(409, "STALE", "Someone else changed this deadline. Refresh and try again.");
    const next = { title: v.title ?? cur.title, description: v.description ?? cur.description, type: v.type ?? cur.type, due_date: v.dueDate ?? cur.due_date, due_time: b.dueTime !== undefined ? (v.dueTime ?? null) : cur.due_time };
    const sd = (await q.query(
      `update shared_deadlines set title=$2, description=$3, type=$4, due_date=$5, due_time=$6, version = version + 1, updated_at = now() where id = $1 returning *`,
      [cur.id, next.title, next.description, next.type, next.due_date, next.due_time])).rows[0];
    const users = (await syncSharedUpdate(q, sd)).filter((id) => id !== ctx.user.id);
    const dateChanged = cur.due_date !== sd.due_date || (cur.due_time ?? null) !== (sd.due_time ?? null);
    await notifyUsers(q, users, {
      kind: dateChanged ? "shared_deadline_rescheduled" : "shared_deadline_updated",
      title: dateChanged ? `${cur.code}: ${sd.title} was rescheduled` : `${cur.code}: ${sd.title} was updated`,
      body: dateChanged ? `Your course rep moved it from ${when(cur.due_date, cur.due_time)} to ${when(sd.due_date, sd.due_time)}. Regenerate your study plan so your sessions match.` : "Your course rep updated the details.",
      link: dateChanged ? "/planner" : "/tasks", data: { sharedDeadlineId: sd.id, from: when(cur.due_date, cur.due_time), to: when(sd.due_date, sd.due_time) },
    });
    return { sd, notified: users.length };
  });
  return { ...shared(out.sd), studentsNotified: out.notified };
});

route("DELETE", "/shared-deadlines/:id", async (ctx) => {
  await ctx.db.tx(async (q) => {
    const cur = (await q.query("select sd.*, c.code, c.department_id from shared_deadlines sd join course_catalog c on c.id = sd.catalog_id where sd.id = $1 for update of sd", [ctx.params.id])).rows[0];
    if (!cur || !ctx.user.departmentId || cur.department_id !== ctx.user.departmentId) throw new HttpError(404, "NOT_FOUND", "Deadline not found.");
    if (!canManage(ctx.user, { id: cur.catalog_id, department_id: cur.department_id })) throw new HttpError(403, "FORBIDDEN", "Only the course rep or a department administrator can delete this deadline.");
    const users = (await q.query("select distinct user_id from tasks where shared_deadline_id = $1 and status <> 'completed'", [cur.id])).rows.map((r) => r.user_id).filter((id) => id !== ctx.user.id);
    await q.query("delete from shared_deadlines where id = $1", [cur.id]); // students' tasks stay (shared link cleared by FK)
    await notifyUsers(q, users, { kind: "shared_deadline_removed", title: `${cur.code}: ${cur.title} was removed`, body: "Your course rep removed this deadline. Your task was kept; delete it if you no longer need it.", link: "/tasks", data: {} });
  });
  return new Reply(204);
});
