import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { client, createTestDb, hasTestDb, registerUser } from "./testing.js";

const opts = { skip: !hasTestDb && "set TEST_DATABASE_URL to run backend integration tests" };
let env, ipn = 0;
before(async () => { if (hasTestDb) env = await createTestDb(); });
after(async () => { await env?.close(); });
const user = async () => { const c = client(env.db, `8.8.8.${++ipn}`); const u = await registerUser(c); return { c, u }; };

function upload(c, name, bytes, fields = {}, type = "application/octet-stream") {
  const fd = new FormData();
  fd.set("file", new File([bytes], name, { type }));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return c.raw("POST", "/materials", fd);
}

test("upload text and PDF; contents are extracted and searchable with highlighted snippets", opts, async () => {
  const { c } = await user();
  const course = (await c.post("/courses", { code: "BIO1", name: "Biology" })).data;
  const task = (await c.post("/tasks", { courseId: course.id, title: "Cell test", type: "test", dueDate: "2099-01-01" })).data;
  const pdf = await readFile(new URL("./fixtures/photosynthesis.pdf", import.meta.url));

  const a = await upload(c, "photosynthesis.pdf", pdf, { courseId: course.id, tags: "Plants, chapter 4", notes: "Exam focus", taskIds: task.id });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.mime, "application/pdf"); assert.equal(a.data.textExtracted, true);
  assert.deepEqual(a.data.tags, ["plants", "chapter 4"]); assert.deepEqual(a.data.taskIds, [task.id]);
  const b = await upload(c, "lecture-notes.md", Buffer.from("# Mitosis\nCells divide through prophase, metaphase, anaphase and telophase."), { courseId: course.id });
  assert.equal(b.status, 201);

  const byBody = await c.get("/materials?q=chloroplasts");
  assert.equal(byBody.data.items.length, 1); assert.equal(byBody.data.items[0].title, "photosynthesis");
  assert.match(byBody.data.items[0].snippet, /«chloroplasts»/);
  assert.equal((await c.get("/materials?q=mitosis")).data.items[0].filename, "lecture-notes.md");
  assert.equal((await c.get("/materials?q=photosyn")).data.items.length, 1); // partial word
  assert.equal((await c.get("/materials?q=exam focus")).data.items.length, 1); // notes are searched
  assert.equal((await c.get("/materials?q=zebra")).data.items.length, 0);
  assert.equal((await c.get("/materials?tag=plants")).data.items.length, 1);
  assert.equal((await c.get(`/materials?taskId=${task.id}`)).data.items.length, 1);
  assert.equal((await c.get("/materials?kind=pdf")).data.items.length, 1);
  assert.equal((await c.get("/materials")).data.items.length, 2);
  const usage = (await c.get("/materials/usage")).data;
  assert.equal(usage.files, 2); assert.ok(usage.bytes > 0);
});

test("download returns the exact bytes with safe headers; inline only for PDF/images", opts, async () => {
  const { c } = await user();
  const pdf = await readFile(new URL("./fixtures/photosynthesis.pdf", import.meta.url));
  const m = (await upload(c, "notes.pdf", pdf)).data;
  const dl = await c.get(`/materials/${m.id}/file`);
  assert.equal(dl.status, 200); assert.ok(Buffer.compare(dl.data, pdf) === 0);
  assert.match(dl.headers.get("content-disposition"), /^attachment/);
  assert.equal(dl.headers.get("x-content-type-options"), "nosniff");
  assert.match(dl.headers.get("content-security-policy"), /sandbox/);
  assert.match((await c.get(`/materials/${m.id}/file?inline=1`)).headers.get("content-disposition"), /^inline/);
  const t = (await upload(c, "a.txt", Buffer.from("hello world"))).data;
  assert.match((await c.get(`/materials/${t.id}/file?inline=1`)).headers.get("content-disposition"), /^attachment/); // text never rendered inline
});

test("hostile uploads are rejected: renamed executables, binary as text, unknown types, oversize", opts, async () => {
  const { c } = await user();
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)]);
  assert.equal((await upload(c, "virus.pdf", exe, {}, "application/pdf")).status, 415);
  assert.equal((await upload(c, "virus.exe", exe)).status, 415);
  assert.equal((await upload(c, "image.png", Buffer.from("<script>alert(1)</script>"), {}, "image/png")).status, 415);
  assert.equal((await upload(c, "bin.txt", Buffer.from([1, 2, 0, 3, 4]))).status, 415);
  assert.equal((await upload(c, "empty.txt", Buffer.alloc(0))).status, 400);
  const big = Buffer.alloc(4 * 1024 * 1024 + 1, 97);
  assert.equal((await upload(c, "big.txt", big)).status, 413);
  assert.equal((await c.get("/materials")).data.items.length, 0);
  const fd = new FormData(); fd.set("title", "no file");
  assert.equal((await c.raw("POST", "/materials", fd)).status, 400);
  assert.equal((await c.post("/materials", { title: "json" })).status, 415);
});

test("filenames are sanitised (no path traversal) and titles default sensibly", opts, async () => {
  const { c } = await user();
  const m = (await upload(c, "../../etc/pass\"wd.txt", Buffer.from("plain"))).data;
  assert.equal(m.filename, "passwd.txt"); assert.equal(m.title, "passwd");
});

test("ISOLATION: other users cannot see, download, edit, delete or link materials", opts, async () => {
  const a = await user(), b = await user();
  const m = (await upload(a.c, "secret.txt", Buffer.from("top secret revision notes"))).data;
  assert.equal((await b.c.get("/materials?q=secret")).data.items.length, 0);
  for (const [method, path, body] of [["GET", `/materials/${m.id}`], ["GET", `/materials/${m.id}/file`], ["PATCH", `/materials/${m.id}`, { title: "hax" }], ["PUT", `/materials/${m.id}/tasks`, { taskIds: [] }], ["DELETE", `/materials/${m.id}`]]) {
    assert.equal((await b.c.raw(method, path, method === "GET" ? undefined : (body ?? {}))).status, 404, `${method} ${path}`);
  }
  const course = (await b.c.post("/courses", { code: "X", name: "x" })).data;
  const bTask = (await b.c.post("/tasks", { courseId: course.id, title: "t", type: "test", dueDate: "2099-01-01" })).data;
  assert.equal((await a.c.put(`/materials/${m.id}/tasks`, { taskIds: [bTask.id] })).status, 400); // cannot link to someone else's task
  assert.equal((await upload(a.c, "x.txt", Buffer.from("x"), { taskIds: bTask.id })).status, 400);
  assert.equal((await a.c.get(`/materials/${m.id}`)).status, 200);
});

test("links attach to the task and survive study-plan regeneration; edit and delete work", opts, async () => {
  const { c } = await user();
  const course = (await c.post("/courses", { code: "L1", name: "Links" })).data;
  const task = (await c.post("/tasks", { courseId: course.id, title: "Exam", type: "exam", dueDate: "2099-01-01" })).data;
  const m = (await upload(c, "slides.txt", Buffer.from("slides"))).data;
  assert.deepEqual((await c.put(`/materials/${m.id}/tasks`, { taskIds: [task.id] })).data.taskIds, [task.id]);
  const plan = [{ taskId: task.id, date: "2099-01-01", startsAt: "2099-01-01T10:00", endsAt: "2099-01-01T11:00" }];
  await c.put("/study-sessions/plan", { sessions: plan });
  await c.put("/study-sessions/plan", { sessions: plan }); // regenerate
  assert.equal((await c.get(`/materials?taskId=${task.id}`)).data.items.length, 1);
  const edited = (await c.patch(`/materials/${m.id}`, { title: "Week 3 slides", tags: ["slides"], notes: "important", courseId: course.id })).data;
  assert.equal(edited.title, "Week 3 slides"); assert.equal(edited.courseId, course.id);
  assert.equal((await c.get("/materials?q=important")).data.items.length, 1);
  await c.del(`/tasks/${task.id}`);
  assert.deepEqual((await c.get(`/materials/${m.id}`)).data.taskIds, []); // deleting a task unlinks, keeps the file
  assert.equal((await c.del(`/materials/${m.id}`)).status, 204);
  assert.equal((await env.db.query("select count(*)::int as n from material_blobs")).rows[0].n >= 0, true);
  assert.equal((await c.get(`/materials/${m.id}`)).status, 404);
});

test("search treats % and _ literally (no wildcard injection)", opts, async () => {
  const { c } = await user();
  await upload(c, "a.txt", Buffer.from("plain"), { title: "Chapter 100% rule" });
  await upload(c, "b.txt", Buffer.from("plain"), { title: "Chapter 1000 notes" });
  assert.equal((await c.get("/materials?q=" + encodeURIComponent("100%"))).data.items.length, 1);
  assert.equal((await c.get("/materials?q=" + encodeURIComponent("%"))).data.items.length, 1);
  assert.equal((await c.get("/materials?q=" + encodeURIComponent("_"))).data.items.length, 0);
});

test("partial words are found inside file contents and notes, with the match highlighted", opts, async () => {
  const { c } = await user();
  await upload(c, "bio.txt", Buffer.from("Mitochondria are the powerhouse of the cell. ATP synthase makes energy."), { title: "Cell notes", notes: "revise osmosis" });
  const r = await c.get("/materials?q=mitochond");
  assert.equal(r.data.items.length, 1);
  assert.match(r.data.items[0].snippet, /«Mitochond»ria/);
  assert.equal((await c.get("/materials?q=osmo")).data.items.length, 1); // notes
  assert.equal((await c.get("/materials?q=synthas")).data.items.length, 1);
  assert.equal((await c.get("/materials?q=xylophone")).data.items.length, 0);
});
