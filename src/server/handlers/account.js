import { route } from "../router.js";
import { HttpError, Reply, rateLimit } from "../http.js";
import { clearCookie, verifyPassword } from "../auth.js";
import { contentDisposition } from "../materials-lib.js";

// A full copy of the student's own data (GDPR-style export). Never includes password hashes or other users' data.
route("GET", "/account/export", async (ctx) => {
  await rateLimit(ctx.db, `export:${ctx.user.id}`, 5, 3600);
  const u = ctx.user.id;
  const one = async (sql) => (await ctx.db.query(sql, [u])).rows;
  const data = {
    exportedAt: new Date().toISOString(),
    profile: { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, department: ctx.user.departmentName },
    preferences: (await one("select * from preferences where user_id = $1"))[0] ?? null,
    courses: await one("select id, code, name, priority, rank, catalog_id, created_at from courses where user_id = $1 order by code"),
    tasks: await one("select id, course_id, title, description, type, due_date, due_time, estimated_hours, importance, status, completed_at, shared_deadline_id, created_at from tasks where user_id = $1 order by due_date"),
    studySessions: await one("select id, task_id, date, starts_at, ends_at, minutes, status, reason, completed_at from study_sessions where user_id = $1 order by starts_at"),
    materials: await one("select id, course_id, title, notes, tags, filename, mime, size_bytes, created_at from materials where user_id = $1 order by created_at"),
    warnings: await one("select key, code, severity, title, why, status, created_at from warnings where user_id = $1"),
    notifications: await one("select kind, title, body, read_at, created_at from notifications where user_id = $1 order by created_at"),
    workloadHistory: await one("select day, score, category, active_tasks, overdue_tasks, remaining_hours, capacity_hours from workload_snapshots where user_id = $1 order by day"),
    note: "Study material files are not embedded in this export; download them from the Materials page.",
  };
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": contentDisposition("loadwise-export.json", false), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
});

// Permanently deletes the account and every row owned by it (foreign keys cascade). Requires the password.
route("DELETE", "/account", async (ctx) => {
  await rateLimit(ctx.db, `delacct:${ctx.user.id}`, 5, 3600);
  const b = await ctx.json();
  const { rows } = await ctx.db.query("select password_hash, role from users where id = $1", [ctx.user.id]);
  if (!(await verifyPassword(String(b.password ?? ""), rows[0].password_hash))) throw new HttpError(400, "VALIDATION_ERROR", "Your password is incorrect.", { password: "Incorrect password" });
  await ctx.db.tx(async (q) => {
    // shared deadlines created by this user stay (created_by is set null) so classmates keep their dates
    await q.query("delete from users where id = $1", [ctx.user.id]);
  });
  ctx.setCookie(clearCookie({ secure: ctx.secure }));
  return new Reply(204);
});
