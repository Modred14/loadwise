import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { client, createTestDb, hasTestDb, registerUser } from "./testing.js";
import { setEmailTransport } from "./email.js";

const opts = { skip: !hasTestDb && "set TEST_DATABASE_URL to run backend integration tests" };
let env;
before(async () => { if (hasTestDb) env = await createTestDb(); });
after(async () => { await env?.close(); });

const task = (courseId, over = {}) => ({ courseId, title: "Lab report", type: "assignment", dueDate: "2026-11-20", estimatedHours: 3, ...over });

test("register, me, logout, login; cookie is HttpOnly and SameSite", opts, async () => {
  const c = client(env.db, "1.1.1.1");
  const u = await registerUser(c);
  assert.equal(u.role, "student");
  const me = await c.get("/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, u.email);
  assert.ok(!JSON.stringify(me.data).includes("password"));
  const reg = await client(env.db, "1.1.1.2").raw("POST", "/auth/register", { name: "X", email: "cookie@example.com", password: "correct-horse-1" }, {});
  const sc = reg.headers.getSetCookie()[0];
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.equal((await c.post("/auth/logout")).status, 204);
  assert.equal((await c.get("/auth/me")).status, 401);
  assert.equal((await c.post("/auth/login", { email: u.email, password: u.password })).status, 200);
  assert.equal((await c.get("/auth/me")).status, 200);
});

test("bad credentials and unknown email give the same generic error; duplicate email is 409", opts, async () => {
  const c = client(env.db, "1.1.1.3");
  const u = await registerUser(c);
  const wrong = await client(env.db, "1.1.1.4").post("/auth/login", { email: u.email, password: "nope-nope-1" });
  const unknown = await client(env.db, "1.1.1.5").post("/auth/login", { email: "nobody@example.com", password: "nope-nope-1" });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
  assert.equal(wrong.data.error.message, unknown.data.error.message);
  const dup = await client(env.db, "1.1.1.6").post("/auth/register", { name: "D", email: u.email.toUpperCase(), password: "correct-horse-1" });
  assert.equal(dup.status, 409);
});

test("registration validates fields", opts, async () => {
  const r = await client(env.db, "1.1.1.7").post("/auth/register", { name: "", email: "bad", password: "short" });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.data.error.fields).sort(), ["email", "name", "password"]);
});

test("login is rate limited per email", opts, async () => {
  const email = "ratelimit@example.com";
  let last;
  for (let i = 0; i < 12; i++) last = await client(env.db, `2.2.2.${i}`).post("/auth/login", { email, password: "wrong-password" });
  assert.equal(last.status, 429);
});

test("CSRF: cross-origin mutations are rejected, same-origin and non-browser are allowed", opts, async () => {
  const c = client(env.db, "1.1.2.1");
  await registerUser(c);
  const evil = await c.raw("POST", "/auth/logout", {}, { headers: { origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  const cross = await c.raw("POST", "/auth/logout", {}, { headers: { origin: "", "sec-fetch-site": "cross-site" } });
  assert.equal(cross.status, 403);
  assert.equal((await c.get("/auth/me")).status, 200);
});

test("private routes require a session", opts, async () => {
  const c = client(env.db, "1.1.3.1");
  for (const p of ["/courses", "/tasks", "/study-sessions", "/warnings", "/preferences", "/notifications"]) assert.equal((await c.get(p)).status, 401, p);
});

test("courses: CRUD, duplicate code, delete needs cascade", opts, async () => {
  const c = client(env.db, "1.1.4.1");
  await registerUser(c);
  const a = await c.post("/courses", { code: "CS201", name: "Algorithms", priority: 4 });
  assert.equal(a.status, 201);
  assert.equal((await c.post("/courses", { code: "cs201", name: "Dup" })).status, 409);
  assert.equal((await c.patch(`/courses/${a.data.id}`, { name: "Algorithms II" })).data.name, "Algorithms II");
  await c.post("/tasks", task(a.data.id));
  assert.equal((await c.del(`/courses/${a.data.id}`)).status, 409);
  assert.equal((await c.del(`/courses/${a.data.id}?cascade=true`)).status, 204);
  assert.equal((await c.get("/tasks")).data.items.length, 0);
});

test("course ranking sets rank and derives priority 5..1", opts, async () => {
  const c = client(env.db, "1.1.4.2");
  await registerUser(c);
  const ids = [];
  for (const code of ["A1", "B2", "C3"]) ids.push((await c.post("/courses", { code, name: code })).data.id);
  const r = await c.put("/courses/ranking", { order: [ids[2], ids[0], ids[1]] });
  assert.deepEqual(r.data.items.map((x) => [x.code, x.rank, x.priority]), [["C3", 1, 5], ["A1", 2, 3], ["B2", 3, 1]]);
  assert.equal((await c.put("/courses/ranking", { order: [ids[0], ids[0]] })).status, 400);
});

test("tasks: create/validate/filter/complete/reopen/delete", opts, async () => {
  const c = client(env.db, "1.1.5.1");
  await registerUser(c);
  const course = (await c.post("/courses", { code: "BIO1", name: "Biology" })).data;
  const bad = await c.post("/tasks", { courseId: course.id, title: "", type: "nope", dueDate: "2026-02-30" });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.fields.title && bad.data.error.fields.type && bad.data.error.fields.dueDate);
  const t = (await c.post("/tasks", task(course.id, { title: "Cell test", type: "test", dueTime: "10:00" }))).data;
  assert.equal(t.dueDate, "2026-11-20"); assert.equal(t.dueTime, "10:00"); // plain strings, no timezone shift
  await c.post("/tasks", task(course.id, { title: "Other", type: "exam", dueDate: "2026-12-01" }));
  assert.equal((await c.get("/tasks?type=exam")).data.items.length, 1);
  assert.equal((await c.get("/tasks?q=cell")).data.items.length, 1);
  const done = await c.patch(`/tasks/${t.id}`, { status: "completed" });
  assert.equal(done.data.status, "completed"); assert.ok(done.data.completedAt);
  const reopened = await c.patch(`/tasks/${t.id}`, { status: "todo" });
  assert.equal(reopened.data.completedAt, null);
  assert.equal((await c.patch(`/tasks/${t.id}`, { version: 1, title: "stale" })).status, 409);
  assert.equal((await c.del(`/tasks/${t.id}`)).status, 204);
  assert.equal((await c.patch(`/tasks/${t.id}`, { title: "gone" })).status, 404);
});

test("a task cannot be attached to someone else's course", opts, async () => {
  const a = client(env.db, "1.1.6.1"), b = client(env.db, "1.1.6.2");
  await registerUser(a); await registerUser(b);
  const ca = (await a.post("/courses", { code: "X1", name: "A's" })).data;
  const r = await b.post("/tasks", task(ca.id));
  assert.equal(r.status, 400);
});

test("CROSS-USER ISOLATION: another user's ids return 404 on every resource and never leak", opts, async () => {
  const a = client(env.db, "1.1.7.1"), b = client(env.db, "1.1.7.2");
  await registerUser(a); await registerUser(b);
  const course = (await a.post("/courses", { code: "SEC1", name: "Secret" })).data;
  const t = (await a.post("/tasks", task(course.id, { title: "Private task" }))).data;
  await a.put("/study-sessions/plan", { sessions: [{ taskId: t.id, date: "2026-11-10", startsAt: "2026-11-10T18:00", endsAt: "2026-11-10T19:00", minutes: 60 }] });
  const sess = (await a.get("/study-sessions")).data.items[0];
  await a.post("/warnings/sync", { toCreate: [{ key: "k1", code: "X", severity: "info", title: "T", why: "W", nextStep: "N" }] });
  const warn = (await a.get("/warnings")).data.items[0];

  assert.equal((await b.get("/courses")).data.items.length, 0);
  assert.equal((await b.get("/tasks")).data.items.length, 0);
  assert.equal((await b.get("/study-sessions")).data.items.length, 0);
  assert.equal((await b.get("/warnings")).data.items.length, 0);
  for (const [m, p, body] of [
    ["PATCH", `/courses/${course.id}`, { name: "hax" }], ["DELETE", `/courses/${course.id}?cascade=true`],
    ["PATCH", `/tasks/${t.id}`, { title: "hax" }], ["DELETE", `/tasks/${t.id}`],
    ["PATCH", `/study-sessions/${sess.id}`, { status: "completed" }], ["DELETE", `/study-sessions/${sess.id}`],
    ["POST", `/warnings/${warn.id}/dismiss`], ["POST", `/warnings/${warn.id}/read`],
  ]) {
    const r = await b.raw(m, p, body ?? {});
    assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
  }
  const bogus = await b.put("/study-sessions/plan", { sessions: [{ taskId: t.id, date: "2026-11-10", startsAt: "2026-11-10T18:00", endsAt: "2026-11-10T19:00" }] });
  assert.equal(bogus.status, 400); // cannot plan against someone else's task
  assert.equal((await a.get(`/tasks`)).data.items[0].title, "Private task"); // owner's data untouched
  assert.equal((await b.patch("/tasks/not-a-uuid", { title: "x" })).status, 404);
});

test("plan: replace is atomic, keeps completed sessions, rejects bad input, flags stale plans", opts, async () => {
  const c = client(env.db, "1.1.8.1");
  await registerUser(c);
  const course = (await c.post("/courses", { code: "P1", name: "Plan" })).data;
  const t = (await c.post("/tasks", task(course.id, { estimatedHours: 4 }))).data;
  const s = (i, h) => ({ taskId: t.id, date: `2026-11-1${i}`, startsAt: `2026-11-1${i}T${h}:00`, endsAt: `2026-11-1${i}T${Number(h) + 1}:00`, reason: "because" });
  assert.equal((await c.put("/study-sessions/plan", { sessions: [s(1, "18"), s(2, "18"), s(3, "18")] })).data.count, 3);
  const first = (await c.get("/study-sessions")).data.items[0];
  assert.equal((await c.patch(`/study-sessions/${first.id}`, { status: "completed" })).data.status, "completed");
  assert.equal((await c.get("/tasks")).data.items[0].studiedHours, 1);
  await c.put("/study-sessions/plan", { sessions: [s(4, "10"), s(5, "10")] });
  const all = (await c.get("/study-sessions")).data.items;
  assert.equal(all.length, 3); assert.equal(all.filter((x) => x.status === "completed").length, 1);
  const bad = await c.put("/study-sessions/plan", { sessions: [{ ...s(6, "10"), endsAt: "2026-11-16T09:00" }] });
  assert.equal(bad.status, 400);
  assert.equal((await c.get("/study-sessions")).data.items.length, 3); // failed replace changed nothing
  const upd = await c.patch(`/tasks/${t.id}`, { dueDate: "2026-11-25" });
  assert.equal(upd.data.planStale, true);
  await c.patch(`/tasks/${t.id}`, { status: "completed" });
  assert.equal((await c.put("/study-sessions/plan", { sessions: [s(7, "10")] })).status, 400); // completed task
});

test("warnings sync: no duplicates, update in place, dismiss survives, resolve", opts, async () => {
  const c = client(env.db, "1.1.9.1");
  await registerUser(c);
  const w = { key: "overdue:1", code: "OVERDUE_TASK", severity: "critical", title: "Late", why: "Because", nextStep: "Do it", actionBy: "2026-10-26T09:00", taskIds: [] };
  await c.post("/warnings/sync", { toCreate: [w] });
  await c.post("/warnings/sync", { toCreate: [w] }); // same key again must not duplicate
  let list = (await c.get("/warnings")).data.items;
  assert.equal(list.length, 1);
  await c.post(`/warnings/${list[0].id}/dismiss`);
  await c.post("/warnings/sync", { toUpdate: [{ ...w, why: "Changed" }], toResolve: [] });
  list = (await c.get("/warnings")).data.items;
  assert.equal(list[0].status, "active"); assert.equal(list[0].why, "Changed"); assert.equal(list.length, 1);
  await c.post("/warnings/sync", { toResolve: ["overdue:1"] });
  assert.equal((await c.get("/warnings")).data.items[0].status, "resolved");
  assert.equal((await c.post("/warnings/sync", { toCreate: [{ key: "x", severity: "bogus" }] })).status, 400);
});

test("preferences: partial updates merge, validate, and default sensibly", opts, async () => {
  const c = client(env.db, "1.1.10.1");
  await registerUser(c);
  assert.equal((await c.get("/preferences")).data.dailyStudyHours, 3);
  const p = await c.put("/preferences", { dailyStudyHours: 5, timezone: "Africa/Lagos", availableDays: [1, 2, 3] });
  assert.equal(p.data.dailyStudyHours, 5); assert.equal(p.data.maxSessionMinutes, 90); assert.deepEqual(p.data.availableDays, [1, 2, 3]);
  const q = await c.put("/preferences", { breakMinutes: 15 });
  assert.equal(q.data.dailyStudyHours, 5); assert.equal(q.data.breakMinutes, 15);
  assert.equal((await c.put("/preferences", { dailyStudyHours: 99, timezone: "Mars/Base" })).status, 400);
});

test("password change signs out other devices; forgot/reset works and tokens are single use", opts, async () => {
  const phone = client(env.db, "1.1.11.1"), laptop = client(env.db, "1.1.11.2");
  const u = await registerUser(phone);
  await laptop.post("/auth/login", { email: u.email, password: u.password });
  assert.equal((await phone.post("/auth/change-password", { currentPassword: "wrong-wrong", newPassword: "another-pass-1" })).status, 400);
  assert.equal((await phone.post("/auth/change-password", { currentPassword: u.password, newPassword: "another-pass-1" })).status, 204);
  assert.equal((await laptop.get("/auth/me")).status, 401);
  assert.equal((await phone.get("/auth/me")).status, 200);

  const sent = [];
  setEmailTransport(async (m) => { sent.push(m); return { ok: true }; });
  const anon = client(env.db, "1.1.11.3");
  assert.equal((await anon.post("/auth/forgot", { email: "unknown@example.com" })).status, 202); // same answer for unknown email
  assert.equal((await anon.post("/auth/forgot", { email: u.email })).status, 202);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sent.length, 1);
  const token = /token=([\w-]+)/.exec(sent[0].text)[1];
  assert.equal((await anon.post("/auth/reset", { token, password: "brand-new-pass-1" })).status, 204);
  assert.equal((await anon.post("/auth/reset", { token, password: "brand-new-pass-2" })).status, 400); // single use
  assert.equal((await phone.get("/auth/me")).status, 401); // all sessions revoked
  assert.equal((await anon.post("/auth/login", { email: u.email, password: "brand-new-pass-1" })).status, 200);
  setEmailTransport(null);
});
