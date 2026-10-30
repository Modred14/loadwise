import { route } from "../router.js";
import { Fields, HttpError, Reply, clampInt, isUuid, likeEscape, rateLimit } from "../http.js";
import { material } from "../serialize.js";
import { MAX_FILE_BYTES, MAX_USER_BYTES, MAX_USER_FILES, contentDisposition, detectKind, extractText, sanitizeFilename } from "../materials-lib.js";

const COLS = `m.id, m.course_id, m.title, m.notes, m.tags, m.filename, m.mime, m.size_bytes, m.text_extracted, m.created_at, m.updated_at,
  coalesce((select array_agg(mt.task_id) from material_tasks mt where mt.material_id = m.id), '{}') as task_ids`;

function parseTags(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map((t) => String(t).trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean);
  if (list.length > 10 || list.some((t) => t.length > 30)) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { tags: "Use up to 10 tags of at most 30 characters" });
  return [...new Set(list)];
}

async function ownedTaskIds(q, userId, ids) {
  if (!ids.length) return [];
  const { rows } = await q.query("select id from tasks where user_id = $1 and id = any($2::uuid[])", [userId, ids]);
  if (rows.length !== new Set(ids).size) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { taskIds: "Some tasks were not found" });
  return rows.map((r) => r.id);
}

route("GET", "/materials", async (ctx) => {
  const q = ctx.query;
  const args = [ctx.user.id];
  const where = ["m.user_id = $1"];
  const param = (v) => { args.push(v); return args.length; };
  const add = (sql, v) => { where.push(sql.replaceAll("?", `$${param(v)}`)); };
  if (q.courseId) { if (!isUuid(q.courseId)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid course."); add("m.course_id = ?", q.courseId); }
  if (q.taskId) { if (!isUuid(q.taskId)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid task."); add("exists (select 1 from material_tasks mt where mt.material_id = m.id and mt.task_id = ?)", q.taskId); }
  if (q.tag) add("? = any(m.tags)", String(q.tag).toLowerCase().slice(0, 30));
  if (q.kind) { const map = { pdf: "application/pdf", image: "image/%", text: "text/%", document: "application/vnd.openxmlformats%" }; if (!map[q.kind]) throw new HttpError(400, "VALIDATION_ERROR", "Invalid type."); add("m.mime like ?", map[q.kind]); }
  const search = String(q.q ?? "").trim().slice(0, 200);
  let rank = "m.created_at", extra = "", from = "materials m";
  if (search) {
    const i = param(search);
    // full-text on title/tags/notes/file contents, plus substring match so partial words still find things
    const like = param(`%${likeEscape(search)}%`);
    from = `materials m, websearch_to_tsquery('english', $${i}) tsq`;
    where.push(`(m.search @@ tsq or m.title ilike $${like} or m.filename ilike $${like} or array_to_string(m.tags, ' ') ilike $${like} or m.notes ilike $${like} or m.extracted_text ilike $${like})`);
    rank = "ts_rank(m.search, tsq) desc, m.created_at";
    extra = `, ts_headline('english', left(m.extracted_text || ' ' || m.notes, 30000), tsq, 'StartSel=«,StopSel=»,MaxFragments=1,MaxWords=24,MinWords=8') as snippet,
      case when strpos(lower(m.extracted_text), lower($${i})) > 0 then substr(m.extracted_text, greatest(strpos(lower(m.extracted_text), lower($${i})) - 60, 1), 200) end as raw_context`;
  }
  const limit = clampInt(q.limit, 30, 1, 50), offset = clampInt(q.cursor, 0, 0, 100000);
  const { rows } = await ctx.db.query(`select ${COLS}${extra} from ${from} where ${where.join(" and ")} order by ${rank} desc limit ${limit + 1} offset ${offset}`, args);
  // Prefer the full-text snippet; for partial-word matches fall back to the surrounding text with the match marked.
  const mark = (ctx) => { const i = ctx.toLowerCase().indexOf(search.toLowerCase()); return i < 0 ? ctx : `${ctx.slice(0, i)}«${ctx.slice(i, i + search.length)}»${ctx.slice(i + search.length)}`; };
  const items = rows.slice(0, limit).map((r) => material({ ...r, snippet: !search ? undefined : r.snippet?.includes("«") ? r.snippet : r.raw_context ? mark(r.raw_context.replace(/\s+/g, " ").trim()) : undefined }));
  return { items, nextCursor: rows.length > limit ? String(offset + limit) : null };
});

route("POST", "/materials", async (ctx) => {
  await rateLimit(ctx.db, `upload:${ctx.user.id}`, 30, 3600);
  const len = Number(ctx.req.headers.get("content-length") ?? 0);
  if (len > MAX_FILE_BYTES + 100_000) throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Files can be at most ${MAX_FILE_BYTES / 1048576} MB.`);
  if (!(ctx.req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the file as multipart form data.");
  let form;
  try { form = await ctx.req.formData(); } catch { throw new HttpError(400, "BAD_UPLOAD", "The upload could not be read."); }
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "VALIDATION_ERROR", "Please choose a file.", { file: "Choose a file" });
  if (file.size === 0) throw new HttpError(400, "VALIDATION_ERROR", "That file is empty.", { file: "The file is empty" });
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Files can be at most ${MAX_FILE_BYTES / 1048576} MB.`, { file: "File is too large" });
  const filename = sanitizeFilename(file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(filename, buf);
  if (!kind) throw new HttpError(415, "UNSUPPORTED_FILE", "Only PDF, PNG, JPG, TXT, Markdown, DOCX and PPTX files are accepted, and the file contents must match its type.", { file: "Unsupported or mismatched file type" });

  const f = new Fields().str("title", form.get("title") || filename.replace(/\.[^.]+$/, ""), { max: 160, label: "Title" }).str("notes", form.get("notes") ?? "", { min: 0, max: 2000 });
  const courseId = form.get("courseId") || null;
  if (courseId) f.uuid("courseId", courseId);
  const v = f.done();
  const tags = parseTags(form.get("tags"));
  let taskIds = [];
  const rawTasks = form.get("taskIds");
  if (rawTasks) { taskIds = String(rawTasks).split(",").map((s) => s.trim()).filter(Boolean); if (!taskIds.every(isUuid) || taskIds.length > 20) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { taskIds: "Invalid tasks" }); }
  const text = await extractText(kind, buf);

  const created = await ctx.db.tx(async (q) => {
    const usage = (await q.query("select coalesce(sum(size_bytes), 0)::bigint as bytes, count(*)::int as n from materials where user_id = $1", [ctx.user.id])).rows[0];
    if (usage.n >= MAX_USER_FILES || usage.bytes + buf.length > MAX_USER_BYTES) throw new HttpError(413, "QUOTA_EXCEEDED", `Your study material storage is full (${MAX_USER_BYTES / 1048576} MB). Delete something first.`);
    if (courseId) { const own = await q.query("select 1 from courses where id = $1 and user_id = $2", [courseId, ctx.user.id]); if (!own.rowCount) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { courseId: "Unknown course" }); }
    const ids = await ownedTaskIds(q, ctx.user.id, taskIds);
    const m = (await q.query(
      `insert into materials (user_id, course_id, title, notes, tags, filename, mime, size_bytes, text_extracted, extracted_text)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [ctx.user.id, courseId, v.title, v.notes ?? "", tags, filename, kind.mime, buf.length, text != null && text.length > 0, text ?? ""])).rows[0];
    await q.query("insert into material_blobs (material_id, content) values ($1, $2)", [m.id, buf]);
    if (ids.length) await q.query("insert into material_tasks (material_id, task_id) select $1, unnest($2::uuid[])", [m.id, ids]);
    return (await q.query(`select ${COLS} from materials m where m.id = $1`, [m.id])).rows[0];
  });
  return new Reply(201, material(created));
});

route("GET", "/materials/usage", async (ctx) => {
  const r = (await ctx.db.query("select coalesce(sum(size_bytes), 0)::bigint as bytes, count(*)::int as files from materials where user_id = $1", [ctx.user.id])).rows[0];
  return { bytes: r.bytes, files: r.files, maxBytes: MAX_USER_BYTES, maxFiles: MAX_USER_FILES, maxFileBytes: MAX_FILE_BYTES };
});

route("GET", "/materials/:id", async (ctx) => {
  const r = (await ctx.db.query(`select ${COLS} from materials m where m.id = $1 and m.user_id = $2`, [ctx.params.id, ctx.user.id])).rows[0];
  if (!r) throw new HttpError(404, "NOT_FOUND", "Material not found.");
  return material(r);
});

route("GET", "/materials/:id/file", async (ctx) => {
  const r = (await ctx.db.query("select m.filename, m.mime, b.content from materials m join material_blobs b on b.material_id = m.id where m.id = $1 and m.user_id = $2", [ctx.params.id, ctx.user.id])).rows[0];
  if (!r) throw new HttpError(404, "NOT_FOUND", "Material not found.");
  const inlineOk = ctx.query.inline === "1" && (r.mime === "application/pdf" || r.mime.startsWith("image/"));
  return new Response(r.content, { headers: {
    "Content-Type": r.mime, "Content-Length": String(r.content.length), "Content-Disposition": contentDisposition(r.filename, inlineOk),
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});

route("PATCH", "/materials/:id", async (ctx) => {
  const b = await ctx.json();
  const f = new Fields().str("title", b.title, { max: 160, optional: true }).str("notes", b.notes ?? "", { min: 0, max: 2000, optional: b.notes === undefined });
  if (b.courseId !== undefined) f.uuid("courseId", b.courseId, { nullable: true });
  const v = f.done();
  const tags = b.tags !== undefined ? parseTags(b.tags) : null;
  const row = await ctx.db.tx(async (q) => {
    if (v.courseId) { const own = await q.query("select 1 from courses where id = $1 and user_id = $2", [v.courseId, ctx.user.id]); if (!own.rowCount) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { courseId: "Unknown course" }); }
    const u = await q.query(
      `update materials set title = coalesce($3, title), notes = case when $4::boolean then $5 else notes end, tags = coalesce($6::text[], tags),
         course_id = case when $7::boolean then $8 else course_id end, updated_at = now() where id = $1 and user_id = $2 returning id`,
      [ctx.params.id, ctx.user.id, v.title ?? null, b.notes !== undefined, v.notes ?? "", tags, b.courseId !== undefined, v.courseId ?? null]);
    if (!u.rowCount) throw new HttpError(404, "NOT_FOUND", "Material not found.");
    return (await q.query(`select ${COLS} from materials m where m.id = $1`, [ctx.params.id])).rows[0];
  });
  return material(row);
});

// Links belong to the task, so they survive study-plan regeneration (which replaces sessions).
route("PUT", "/materials/:id/tasks", async (ctx) => {
  const b = await ctx.json();
  if (!Array.isArray(b.taskIds) || b.taskIds.length > 20 || !b.taskIds.every(isUuid)) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", { taskIds: "Invalid tasks" });
  const row = await ctx.db.tx(async (q) => {
    const own = await q.query("select 1 from materials where id = $1 and user_id = $2 for update", [ctx.params.id, ctx.user.id]);
    if (!own.rowCount) throw new HttpError(404, "NOT_FOUND", "Material not found.");
    const ids = await ownedTaskIds(q, ctx.user.id, b.taskIds);
    await q.query("delete from material_tasks where material_id = $1", [ctx.params.id]);
    if (ids.length) await q.query("insert into material_tasks (material_id, task_id) select $1, unnest($2::uuid[])", [ctx.params.id, ids]);
    return (await q.query(`select ${COLS} from materials m where m.id = $1`, [ctx.params.id])).rows[0];
  });
  return material(row);
});

route("DELETE", "/materials/:id", async (ctx) => {
  const r = await ctx.db.query("delete from materials where id = $1 and user_id = $2", [ctx.params.id, ctx.user.id]);
  if (!r.rowCount) throw new HttpError(404, "NOT_FOUND", "Material not found.");
  return new Reply(204);
});
