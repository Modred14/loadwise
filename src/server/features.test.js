import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { client, createTestDb, hasTestDb, registerUser } from "./testing.js";

const opts = { skip: !hasTestDb && "set TEST_DATABASE_URL to run backend integration tests" };
let env, deptA, deptB;
before(async () => {
  if (!hasTestDb) return;
  env = await createTestDb();
  deptA = (await env.db.query("insert into departments (name) values ('Computer Science') returning id")).rows[0].id;
  deptB = (await env.db.query("insert into departments (name) values ('Biology') returning id")).rows[0].id;
});
after(async () => { await env?.close(); });

let ipn = 0;
const newClient = () => client(env.db, `9.9.${Math.floor(ipn / 250)}.${(ipn++ % 250) + 1}`);
async function student(departmentId, over = {}) {
  const c = newClient();
  const u = await registerUser(c, { departmentId, ...over });
  return { c, u };
}
async function makeAdmin(u) { await env.db.query("update users set role = 'dept_admin' where id = $1", [u.id]); }

test("registration can join a department; departments are listed publicly", opts, async () => {
  const anon = newClient();
  const list = await anon.get("/departments");
  assert.equal(list.status, 200);
  assert.ok(list.data.items.some((d) => d.name === "Computer Science"));
  const { c, u } = await student(deptA);
  assert.equal(u.departmentName, "Computer Science");
  assert.equal(u.role, "student");
  assert.equal((await c.patch("/profile", { departmentId: "11111111-1111-4111-8111-111111111111" })).status, 400);
});

test("catalog: only admins manage it; students see their department's courses only", opts, async () => {
  const admin = await student(deptA); await makeAdmin(admin.u);
  const s = await student(deptA);
  const other = await student(deptB);
  assert.equal((await s.c.post("/catalog", { code: "CS101", name: "Intro" })).status, 403);
  const cat = await admin.c.post("/catalog", { code: "CS101", name: "Intro to CS" });
  assert.equal(cat.status, 201);
  assert.equal((await admin.c.post("/catalog", { code: "cs101", name: "Dup" })).status, 409);
  assert.equal((await s.c.get("/catalog")).data.items.length >= 1, true);
  assert.equal((await other.c.get("/catalog")).data.items.some((x) => x.code === "CS101"), false);
  // a student cannot link a course to another department's catalog
  assert.equal((await other.c.post("/courses", { code: "CS101", name: "x", catalogId: cat.data.id })).status, 400);
  // admin of another department cannot touch it
  const otherAdmin = await student(deptB); await makeAdmin(otherAdmin.u);
  assert.equal((await otherAdmin.c.patch(`/catalog/${cat.data.id}`, { name: "hax" })).status, 404);
  assert.equal((await otherAdmin.c.del(`/catalog/${cat.data.id}`)).status, 404);
});

test("SHARED DEADLINES: rep adds -> students get tasks + notification; reschedule syncs; locks; dismissal", opts, async () => {
  const admin = await student(deptA); await makeAdmin(admin.u);
  const rep = await student(deptA), s1 = await student(deptA), s2 = await student(deptA), bystander = await student(deptA);
  const cat = (await admin.c.post("/catalog", { code: "MTH201", name: "Linear Algebra" })).data;
  assert.equal((await admin.c.post(`/catalog/${cat.id}/reps`, { email: rep.u.email })).status, 201);
  assert.equal((await admin.c.post(`/catalog/${cat.id}/reps`, { email: "nobody@example.com" })).status, 404);
  assert.equal((await rep.c.get("/auth/me")).data.user.isRep, true);

  const c1 = (await s1.c.post("/courses", { code: "MTH201", name: "LinAlg", catalogId: cat.id })).data;
  await s2.c.post("/courses", { code: "MTH201", name: "LinAlg", catalogId: cat.id });
  await bystander.c.post("/courses", { code: "MTH201", name: "LinAlg" }); // not linked

  // a normal student cannot publish
  assert.equal((await bystander.c.post("/shared-deadlines", { catalogId: cat.id, title: "Fake", type: "exam", dueDate: "2099-01-01" })).status, 403);

  const created = await rep.c.post("/shared-deadlines", { catalogId: cat.id, title: "Midterm", type: "exam", dueDate: "2099-03-10", dueTime: "09:00" });
  assert.equal(created.status, 201);
  assert.equal(created.data.studentsNotified, 2);
  const t1 = (await s1.c.get("/tasks")).data.items;
  assert.equal(t1.length, 1); assert.equal(t1[0].title, "Midterm"); assert.equal(t1[0].sharedDeadlineId, created.data.id);
  assert.equal((await bystander.c.get("/tasks")).data.items.length, 0);
  assert.equal((await s1.c.get("/notifications")).data.items[0].kind, "shared_deadline_added");

  // student can set prep hours / importance but not the managed date
  assert.equal((await s1.c.patch(`/tasks/${t1[0].id}`, { estimatedHours: 12, importance: 5 })).status, 200);
  assert.equal((await s1.c.patch(`/tasks/${t1[0].id}`, { dueDate: "2099-03-11" })).status, 403);
  assert.equal((await s1.c.patch(`/tasks/${t1[0].id}`, { title: "Midterm", dueDate: "2099-03-10", estimatedHours: 10 })).status, 200); // unchanged managed fields are fine

  // rep reschedules -> tasks move, student edits are kept, notification explains
  const moved = await rep.c.patch(`/shared-deadlines/${created.data.id}`, { dueDate: "2099-03-12", dueTime: "14:00" });
  assert.equal(moved.data.version, 2); assert.equal(moved.data.studentsNotified, 2);
  const after = (await s1.c.get("/tasks")).data.items[0];
  assert.equal(after.dueDate, "2099-03-12"); assert.equal(after.dueTime, "14:00"); assert.equal(after.estimatedHours, 10); assert.equal(after.importance, 5);
  const n = (await s1.c.get("/notifications")).data.items[0];
  assert.equal(n.kind, "shared_deadline_rescheduled"); assert.match(n.body, /2099-03-10 at 09:00 to 2099-03-12 at 14:00/);
  assert.equal((await rep.c.patch(`/shared-deadlines/${created.data.id}`, { version: 1, title: "x" })).status, 409);
  assert.equal((await bystander.c.patch(`/shared-deadlines/${created.data.id}`, { title: "hax" })).status, 403);

  // completed tasks are not rewritten; dismissed (deleted) tasks do not come back on relink
  await s2.c.patch(`/tasks/${(await s2.c.get("/tasks")).data.items[0].id}`, { status: "completed" });
  await rep.c.patch(`/shared-deadlines/${created.data.id}`, { dueDate: "2099-03-13" });
  assert.equal((await s2.c.get("/tasks")).data.items[0].dueDate, "2099-03-12");
  await s1.c.del(`/tasks/${after.id}`);
  await s1.c.patch(`/courses/${c1.id}`, { catalogId: null });
  await s1.c.patch(`/courses/${c1.id}`, { catalogId: cat.id });
  assert.equal((await s1.c.get("/tasks")).data.items.length, 0);

  // visibility is limited to the department; other departments cannot see or change it
  const outsider = await student(deptB);
  assert.equal((await outsider.c.get("/shared-deadlines")).data.items.length, 0);
  assert.equal((await outsider.c.patch(`/shared-deadlines/${created.data.id}`, { title: "hax" })).status, 404);
  assert.equal((await outsider.c.del(`/shared-deadlines/${created.data.id}`)).status, 404);

  // deleting notifies and keeps students' tasks
  assert.equal((await rep.c.del(`/shared-deadlines/${created.data.id}`)).status, 204);
  assert.equal((await s2.c.get("/tasks")).data.items.length, 1);
  assert.equal((await s2.c.get("/tasks")).data.items[0].sharedDeadlineId, null);
});

test("a student who joins later gets existing shared deadlines when linking a course", opts, async () => {
  const admin = await student(deptA); await makeAdmin(admin.u);
  const cat = (await admin.c.post("/catalog", { code: "PHY100", name: "Physics" })).data;
  await admin.c.post("/shared-deadlines", { catalogId: cat.id, title: "Quiz 1", type: "test", dueDate: "2099-05-01" });
  const late = await student(deptA);
  await late.c.post("/courses", { code: "PHY100", name: "Physics", catalogId: cat.id });
  assert.equal((await late.c.get("/tasks")).data.items[0].title, "Quiz 1");
});

test("workload trend: server computes the score from stored data and keeps one row per day", opts, async () => {
  const { c } = await student(null);
  const course = (await c.post("/courses", { code: "T1", name: "Trend" })).data;
  assert.equal((await c.get("/workload/trend")).data.items.length, 0);
  const s1 = await c.post("/workload/snapshot");
  assert.equal(s1.data.score, 0);
  await c.post("/tasks", { courseId: course.id, title: "Overdue", type: "exam", dueDate: "2020-01-01", estimatedHours: 8 });
  const s2 = await c.post("/workload/snapshot");
  assert.ok(s2.data.score > 0);
  const t = await c.get("/workload/trend?days=30");
  assert.equal(t.data.items.length, 1); // same day -> updated, not duplicated
  assert.equal(t.data.items[0].score, s2.data.score);
  assert.equal(t.data.items[0].overdueTasks, 1);
  assert.equal(t.data.summary.latest, s2.data.score);
});

test("DEPARTMENT INSIGHTS: admin only, suppressed below the cohort size, no individual data, small cells hidden", opts, async () => {
  const dept = (await env.db.query("insert into departments (name) values ('Engineering') returning id")).rows[0].id;
  const admin = await student(dept); await makeAdmin(admin.u);
  const regular = await student(dept);
  assert.equal((await regular.c.get("/department/insights")).status, 403);
  const tiny = await admin.c.get("/department/insights");
  assert.equal(tiny.data.suppressed, true);
  assert.equal(tiny.data.distribution, null);

  const cat = (await admin.c.post("/catalog", { code: "ENG100", name: "Statics" })).data;
  const cat2 = (await admin.c.post("/catalog", { code: "ENG200", name: "Dynamics" })).data;
  const names = [];
  for (let i = 0; i < 6; i++) {
    const s = await student(dept, { name: `Secretname${i}` });
    names.push(s.u.name, s.u.email);
    const course = (await s.c.post("/courses", { code: "ENG100", name: "Statics", catalogId: cat.id })).data;
    await s.c.post("/tasks", { courseId: course.id, title: `Private ${i}`, type: i < 3 ? "exam" : "assignment", dueDate: i < 3 ? "2099-01-02" : "2099-06-01", estimatedHours: i < 3 ? 40 : 2 });
    if (i < 2) await s.c.post("/courses", { code: "ENG200", name: "Dynamics", catalogId: cat2.id });
  }
  await admin.c.post("/shared-deadlines", { catalogId: cat.id, title: "Statics exam", type: "exam", dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
  await admin.c.post("/shared-deadlines", { catalogId: cat2.id, title: "Dynamics exam", type: "exam", dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
  const r = await admin.c.get("/department/insights");
  assert.equal(r.status, 200); assert.equal(r.data.suppressed, false);
  const text = JSON.stringify(r.data);
  for (const secret of names) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.ok(!text.includes("Private "));
  assert.equal(r.data.distribution.activeStudents, 6);
  assert.equal(r.data.distribution.manageable, null); // 3 and 3 are < K=5 -> both hidden together (complementary suppression)
  assert.equal(r.data.distribution.heavy, null);
  const eng100 = r.data.catalog.find((c) => c.code === "ENG100"), eng200 = r.data.catalog.find((c) => c.code === "ENG200");
  assert.equal(eng100.enrolled, 6);
  assert.equal(eng200.suppressed, true); // only 2 enrolled
  assert.equal(r.data.clashes.length, 1);
  assert.equal(r.data.clashes[0].studentsInBoth, null); // 2 students in both < K
  assert.equal((await env.db.query("select 1")).rowCount, 1);
  // another department's admin sees nothing of this department
  const otherAdmin = await student(deptB); await makeAdmin(otherAdmin.u);
  const o = await otherAdmin.c.get("/department/insights");
  assert.equal(o.data.suppressed, true);
  assert.ok(!JSON.stringify(o.data).includes("ENG100"));
});
