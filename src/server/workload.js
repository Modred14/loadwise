// Runs the shared workload engine on the server for a user's stored data.
import { computeWorkload, generateWarnings } from "../lib/engine/index.js";
import { localDateKey, wallClockNow } from "./time.js";

export const prefsRowToEngine = (r) => r && ({
  dailyStudyHours: Number(r.daily_study_hours), availableDays: r.available_days, maxSessionMinutes: r.max_session_minutes,
  breakMinutes: r.break_minutes, preferredStartTime: r.preferred_start_time,
});

const taskRowToEngine = (r) => ({
  id: r.id, courseId: r.course_id, title: r.title, type: r.type, dueDate: r.due_date, dueTime: r.due_time ?? null,
  estimatedHours: r.estimated_hours ?? undefined, importance: r.importance, status: r.status, completedAt: r.completed_at,
  studiedHours: Number(r.studied_hours) || 0,
});
const courseRowToEngine = (r) => ({ id: r.id, code: r.code, name: r.name, priority: r.priority });

export async function loadUserData(q, userId) {
  const [courses, tasks, prefs] = await Promise.all([
    q.query("select * from courses where user_id = $1", [userId]),
    q.query(
      `select t.*, coalesce((select sum(s.minutes) from study_sessions s where s.task_id = t.id and s.status = 'completed'), 0) / 60.0 as studied_hours
         from tasks t where t.user_id = $1`, [userId]),
    q.query("select * from preferences where user_id = $1", [userId]),
  ]);
  return {
    courses: courses.rows.map(courseRowToEngine),
    tasks: tasks.rows.map(taskRowToEngine),
    prefsRow: prefs.rows[0] ?? null,
    prefs: prefsRowToEngine(prefs.rows[0]),
    timezone: prefs.rows[0]?.timezone ?? "UTC",
  };
}

export function workloadFor(data, at = new Date()) {
  const now = wallClockNow(data.timezone, at);
  return { now, day: localDateKey(now), workload: computeWorkload({ tasks: data.tasks, courses: data.courses, prefs: data.prefs, now }) };
}

export { generateWarnings };

/** Upserts today's snapshot (in the user's timezone). Returns the stored row shape. */
export async function recordSnapshot(q, userId, at = new Date()) {
  const data = await loadUserData(q, userId);
  const { day, workload: w } = workloadFor(data, at);
  await q.query(
    `insert into workload_snapshots (user_id, day, score, category, active_tasks, overdue_tasks, remaining_hours, capacity_hours, components)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (user_id, day) do update set score = excluded.score, category = excluded.category, active_tasks = excluded.active_tasks,
       overdue_tasks = excluded.overdue_tasks, remaining_hours = excluded.remaining_hours, capacity_hours = excluded.capacity_hours,
       components = excluded.components, updated_at = now()`,
    [userId, day, w.score, w.category, w.counts.active, w.counts.overdue, w.totals.remainingHours, w.totals.capacityHours14d, JSON.stringify(w.components)],
  );
  return { day, score: w.score, category: w.category };
}
