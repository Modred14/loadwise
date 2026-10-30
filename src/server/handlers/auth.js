import { route } from "../router.js";
import { Fields, HttpError, clientIp, rateLimit, Reply } from "../http.js";
import { DUMMY_HASH, clearCookie, createSession, hashPassword, publicUser, sessionCookie, sha256, newToken, userFromRequest, validatePassword, verifyPassword } from "../auth.js";
import { sendEmail } from "../email.js";

const emailOk = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function start(ctx, userId) {
  const token = await createSession(ctx.db, userId, ctx.req.headers.get("user-agent"));
  ctx.setCookie(sessionCookie(token, { secure: ctx.secure }));
  const user = await userFromRequest(ctx.db, new Request("http://x", { headers: { cookie: `lw_session=${token}` } }));
  return publicUser(user);
}

route("POST", "/auth/register", async (ctx) => {
  const ip = clientIp(ctx.req);
  await rateLimit(ctx.db, `register:ip:${ip}`, 10, 3600);
  const b = await ctx.json();
  const f = new Fields().str("name", b.name, { max: 120, label: "Name" });
  if (!emailOk(b.email)) f.fail("email", "Enter a valid email address"); else f.values.email = b.email.trim().toLowerCase();
  validatePassword(f, "password", b.password);
  if (b.departmentId) f.uuid("departmentId", b.departmentId);
  const v = f.done();
  const hash = await hashPassword(v.password);
  let user;
  try {
    const { rows } = await ctx.db.query(
      `insert into users (name, email, password_hash, department_id) values ($1, $2, $3, (select id from departments where id = $4)) returning id`,
      [v.name, v.email, hash, v.departmentId ?? null],
    );
    user = rows[0];
  } catch (e) {
    if (e.code === "23505") throw new HttpError(409, "EMAIL_TAKEN", "That email is already registered.", { email: "Already registered" });
    throw e;
  }
  await ctx.db.query("insert into preferences (user_id) values ($1) on conflict do nothing", [user.id]);
  return new Reply(201, { user: await start(ctx, user.id) });
}, { auth: false });

route("POST", "/auth/login", async (ctx) => {
  const b = await ctx.json();
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const ip = clientIp(ctx.req);
  await rateLimit(ctx.db, `login:ip:${ip}`, 40, 900);
  await rateLimit(ctx.db, `login:email:${email}`, 10, 900);
  const { rows } = await ctx.db.query("select id, password_hash from users where lower(email) = $1", [email]);
  const ok = await verifyPassword(typeof b.password === "string" ? b.password : "", rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  return { user: await start(ctx, rows[0].id) };
}, { auth: false });

route("POST", "/auth/logout", async (ctx) => {
  await ctx.db.query("delete from sessions where id = $1", [ctx.user.sessionId]);
  ctx.setCookie(clearCookie({ secure: ctx.secure }));
  return new Reply(204);
});

route("POST", "/auth/logout-all", async (ctx) => {
  await ctx.db.query("delete from sessions where user_id = $1", [ctx.user.id]);
  ctx.setCookie(clearCookie({ secure: ctx.secure }));
  return new Reply(204);
});

route("GET", "/auth/me", async (ctx) => ({ user: publicUser(ctx.user) }));

route("POST", "/auth/change-password", async (ctx) => {
  await rateLimit(ctx.db, `pwchange:${ctx.user.id}`, 10, 3600);
  const b = await ctx.json();
  const f = new Fields();
  validatePassword(f, "newPassword", b.newPassword);
  f.done();
  const { rows } = await ctx.db.query("select password_hash from users where id = $1", [ctx.user.id]);
  if (!(await verifyPassword(String(b.currentPassword ?? ""), rows[0].password_hash))) throw new HttpError(400, "VALIDATION_ERROR", "Your current password is incorrect.", { currentPassword: "Incorrect password" });
  await ctx.db.query("update users set password_hash = $2, updated_at = now() where id = $1", [ctx.user.id, await hashPassword(b.newPassword)]);
  await ctx.db.query("delete from sessions where user_id = $1 and id <> $2", [ctx.user.id, ctx.user.sessionId]); // sign out other devices
  return new Reply(204);
});

// Password reset by email. Always answers 202 so it can't be used to discover which emails are registered.
route("POST", "/auth/forgot", async (ctx) => {
  const b = await ctx.json();
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  await rateLimit(ctx.db, `forgot:ip:${clientIp(ctx.req)}`, 10, 3600);
  await rateLimit(ctx.db, `forgot:email:${email}`, 3, 3600);
  const { rows } = await ctx.db.query("select id, name from users where lower(email) = $1", [email]);
  if (rows[0]) {
    const token = newToken();
    await ctx.db.query("insert into password_resets (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [rows[0].id, sha256(token)]);
    const base = process.env.APP_URL ?? ctx.url.origin;
    const link = `${base}/reset-password?token=${token}`;
    sendEmail({ to: email, subject: "Reset your LoadWise password", text: `Hi ${rows[0].name},\n\nUse this link within one hour to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email.` }).catch((e) => console.error("[email] reset failed:", e.message));
  }
  return new Reply(202, { ok: true });
}, { auth: false });

route("POST", "/auth/reset", async (ctx) => {
  await rateLimit(ctx.db, `reset:ip:${clientIp(ctx.req)}`, 20, 3600);
  const b = await ctx.json();
  const f = new Fields();
  validatePassword(f, "password", b.password);
  f.done();
  const hash = typeof b.token === "string" ? sha256(b.token) : "";
  const out = await ctx.db.tx(async (q) => {
    const { rows } = await q.query("update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id", [hash]);
    if (!rows[0]) return null;
    await q.query("update users set password_hash = $2, updated_at = now() where id = $1", [rows[0].user_id, await hashPassword(b.password)]);
    await q.query("delete from sessions where user_id = $1", [rows[0].user_id]);
    return rows[0].user_id;
  });
  if (!out) throw new HttpError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
  return new Reply(204);
}, { auth: false });

// Profile
route("PATCH", "/profile", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields().str("name", b.name, { max: 120, optional: true });
  if (b.departmentId !== undefined) f.uuid("departmentId", b.departmentId, { nullable: true });
  const v = f.done();
  if (v.departmentId) {
    const d = await ctx.db.query("select 1 from departments where id = $1", [v.departmentId]);
    if (!d.rowCount) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { departmentId: "Unknown department" });
  }
  await ctx.db.query(
    `update users set name = coalesce($2, name), department_id = case when $3::boolean then $4 else department_id end, updated_at = now() where id = $1`,
    [ctx.user.id, v.name ?? null, b.departmentId !== undefined, v.departmentId ?? null],
  );
  if (b.departmentId !== undefined && v.departmentId !== ctx.user.departmentId) {
    // Changing department detaches catalog links (they belong to the old department).
    await ctx.db.query("update courses set catalog_id = null where user_id = $1", [ctx.user.id]);
    await ctx.db.query("update tasks set shared_deadline_id = null where user_id = $1", [ctx.user.id]);
  }
  const u = await userFromRequest(ctx.db, ctx.req);
  return { user: publicUser(u) };
});

route("GET", "/departments", async (ctx) => {
  const { rows } = await ctx.db.query("select id, name from departments order by name");
  return { items: rows };
}, { auth: false });

