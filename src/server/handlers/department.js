// Departmental insights for department administrators. Individual students are never exposed:
// every figure is an aggregate over at least MIN_COHORT students, and complementary cells are
// suppressed together so a hidden number can't be recovered by subtraction.
import { route } from "../router.js";
import { HttpError } from "../http.js";
import { computeWorkload } from "../../lib/engine/index.js";
import { MIN_COHORT } from "./catalog.js";
import { localDateKey, wallClockNow } from "../time.js";
import { prefsRowToEngine } from "../workload.js";

const MAJOR = ["exam", "test"];
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

route("GET", "/department/insights", async (ctx) => {
  const u = ctx.user;
  if (u.role !== "dept_admin" || !u.departmentId) throw new HttpError(403, "FORBIDDEN", "Only a department administrator can view departmental insights.");
  const K = MIN_COHORT();
  const dept = u.departmentId;

  const [members, courses, tasks, prefs, catalog, deadlines] = await Promise.all([
    ctx.db.query("select id from users where department_id = $1 limit 5000", [dept]),
    ctx.db.query("select c.* from courses c join users x on x.id = c.user_id where x.department_id = $1", [dept]),
    ctx.db.query(
      `select t.*, coalesce((select sum(s.minutes) from study_sessions s where s.task_id = t.id and s.status = 'completed'), 0) / 60.0 as studied_hours
         from tasks t join users x on x.id = t.user_id where x.department_id = $1 and t.status <> 'completed'`, [dept]),
    ctx.db.query("select p.* from preferences p join users x on x.id = p.user_id where x.department_id = $1", [dept]),
    ctx.db.query("select id, code, name from course_catalog where department_id = $1 order by lower(code)", [dept]),
    ctx.db.query(
      `select sd.id, sd.catalog_id, sd.title, sd.type, sd.due_date, sd.due_time from shared_deadlines sd join course_catalog c on c.id = sd.catalog_id
        where c.department_id = $1 and sd.due_date between current_date and current_date + 21 order by sd.due_date, sd.due_time nulls last`, [dept]),
  ]);

  const base = { generatedAt: new Date().toISOString(), minCohort: K, students: members.rowCount >= K ? members.rowCount : null };
  if (members.rowCount < K) {
    return { ...base, suppressed: true, message: `Insights appear once at least ${K} students in your department are using LoadWise, so no individual can be identified.`, catalog: catalog.rows.map((c) => ({ ...c, suppressed: true })), clashes: [], distribution: null, trend: [] };
  }

  const byUser = (rows) => { const m = new Map(); for (const r of rows) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r]); return m; };
  const cBy = byUser(courses.rows), tBy = byUser(tasks.rows), pBy = new Map(prefs.rows.map((r) => [r.user_id, r]));
  const scores = [];
  const perCatalog = new Map(); // catalogId -> [{score, remainingHours}]
  let manageable = 0, heavy = 0;
  for (const { id } of members.rows) {
    const myCourses = cBy.get(id) ?? [];
    const myTasks = tBy.get(id) ?? [];
    if (!myTasks.length) continue; // students with no active tasks carry no load information
    const pr = pBy.get(id);
    const now = wallClockNow(pr?.timezone ?? "UTC");
    const w = computeWorkload({
      tasks: myTasks.map((r) => ({ id: r.id, courseId: r.course_id, title: r.title, type: r.type, dueDate: r.due_date, dueTime: r.due_time, estimatedHours: r.estimated_hours ?? undefined, importance: r.importance, status: r.status, studiedHours: Number(r.studied_hours) || 0 })),
      courses: myCourses.map((r) => ({ id: r.id, code: r.code, name: r.name, priority: r.priority })), prefs: prefsRowToEngine(pr), now,
    });
    scores.push(w.score);
    if (w.score >= 55) heavy++; else manageable++;
    for (const pc of w.perCourse) {
      const c = myCourses.find((x) => x.id === pc.courseId);
      if (c?.catalog_id) perCatalog.set(c.catalog_id, [...(perCatalog.get(c.catalog_id) ?? []), { score: pc.score, hours: pc.remainingHours, user: id }]);
    }
  }
  const enough = scores.length >= K;
  const distribution = enough && manageable >= K && heavy >= K ? { manageable, heavy, averageScore: Math.round(avg(scores)), activeStudents: scores.length } : enough ? { manageable: null, heavy: null, averageScore: Math.round(avg(scores)), activeStudents: scores.length, note: `A group with fewer than ${K} students is hidden to protect privacy.` } : null;

  const catalogOut = catalog.rows.map((c) => {
    const rows = perCatalog.get(c.id) ?? [];
    const enrolled = courses.rows.filter((x) => x.catalog_id === c.id).length;
    if (enrolled < K) return { id: c.id, code: c.code, name: c.name, suppressed: true };
    return { id: c.id, code: c.code, name: c.name, enrolled, withActiveTasks: rows.length >= K ? rows.length : null, averageCourseScore: rows.length >= K ? Math.round(avg(rows.map((r) => r.score))) : null, averageRemainingHours: rows.length >= K ? avg(rows.map((r) => r.hours)) : null };
  });

  // Clashes use only shared (official) deadlines. The number of affected students is aggregated and suppressed under K.
  const catById = new Map(catalog.rows.map((c) => [c.id, c]));
  const students = new Map(); // catalogId -> Set(user)
  for (const c of courses.rows) if (c.catalog_id) students.set(c.catalog_id, (students.get(c.catalog_id) ?? new Set()).add(c.user_id));
  const byDate = new Map();
  for (const d of deadlines.rows) if (MAJOR.includes(d.type)) byDate.set(d.due_date, [...(byDate.get(d.due_date) ?? []), d]);
  const clashes = [];
  for (const [date, list] of byDate) {
    const cats = [...new Set(list.map((d) => d.catalog_id))];
    if (cats.length < 2) continue;
    let both = 0;
    const sets = cats.map((cid) => students.get(cid) ?? new Set());
    for (const sid of sets[0]) if (sets.slice(1).some((s) => s.has(sid))) both++;
    clashes.push({ date, items: list.map((d) => ({ code: catById.get(d.catalog_id)?.code, title: d.title, type: d.type, time: d.due_time })), studentsInBoth: both >= K ? both : null });
  }

  const trend = (await ctx.db.query(
    `select s.day, round(avg(s.score))::int as "averageScore", count(*)::int as students from workload_snapshots s join users x on x.id = s.user_id
      where x.department_id = $1 and s.day >= current_date - 30 group by s.day having count(*) >= $2 order by s.day`, [dept, K])).rows;

  return { ...base, suppressed: false, distribution, catalog: catalogOut, clashes, trend, today: localDateKey(new Date()) };
});
