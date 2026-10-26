import {
  COURSE_PRIORITY_MULTIPLIER,
  IMPORTANCE_MULTIPLIER,
  TYPE_CONFIG,
  URGENCY_HALF_LIFE_HOURS,
  normalizePrefs,
} from "./config.js";
import { MS_HOUR, addDays, calendarDaysBetween, dueInstant, parseTimeOfDay, startOfDay } from "./dates.js";

export function isCompleted(task) {
  return task?.status === "completed" || Boolean(task?.completedAt);
}

const clampLevel = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
};

/**
 * Hours of study the student can do between `now` and `due`.
 * Counts each available weekday from today to the due day. The due day itself
 * counts half (the deadline interrupts it). Today counts in full; the planner,
 * which knows the actual clock time, is stricter.
 */
export function capacityHours(now, due, prefsInput) {
  const prefs = normalizePrefs(prefsInput);
  if (!due || due <= now) return 0;
  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const span = calendarDaysBetween(today, dueDay);
  let hours = 0;
  for (let i = 0; i <= span; i++) {
    const day = addDays(today, i);
    if (!prefs.availableDays.includes(day.getDay())) continue;
    hours += prefs.dailyStudyHours * (i === span ? 0.5 : 1);
  }
  return hours;
}

/**
 * Turns raw tasks into assessed items. Completed tasks are excluded (they
 * never contribute to active workload), duplicate ids are counted once, and
 * tasks with unparseable dates are reported instead of silently guessed at.
 */
export function assessTasks({ tasks = [], courses = [], now }) {
  const courseById = new Map((courses || []).map((c) => [c.id, c]));
  const seen = new Set();
  const items = [];
  const invalid = [];
  let completedIgnored = 0;

  for (const task of tasks || []) {
    if (!task || task.id == null || seen.has(task.id)) continue;
    seen.add(task.id);
    if (isCompleted(task)) {
      completedIgnored++;
      continue;
    }
    const due = dueInstant(task.dueDate, task.dueTime);
    if (!due) {
      invalid.push(task.id);
      continue;
    }
    const cfg = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.other;
    const course = courseById.get(task.courseId) ?? null;
    const importance = clampLevel(task.importance ?? 3);
    const coursePriority = clampLevel(course?.priority ?? 3);
    const estimated = Number(task.estimatedHours);
    const estimatedHours = Number.isFinite(estimated) && estimated > 0 ? estimated : cfg.defaultHours;
    const studied = Math.max(0, Number(task.studiedHours) || 0);
    const remainingHours = Math.max(0, estimatedHours - studied);
    const hoursLeft = (due - now) / MS_HOUR;
    const overdue = due <= now;
    const weight = cfg.weight * IMPORTANCE_MULTIPLIER[importance] * COURSE_PRIORITY_MULTIPLIER[coursePriority];
    const urgencyFactor = overdue ? 1 : 1 / (1 + hoursLeft / URGENCY_HALF_LIFE_HOURS);
    items.push({
      task,
      course,
      courseId: task.courseId ?? null,
      due,
      dueDay: startOfDay(due),
      hoursLeft,
      overdue,
      cfg,
      importance,
      coursePriority,
      weight,
      estimatedHours,
      remainingHours,
      urgencyFactor,
      pressure: weight * urgencyFactor,
    });
  }

  items.sort((a, b) => a.due - b.due || String(a.task.id).localeCompare(String(b.task.id)));
  return { items, invalid, completedIgnored };
}

export function startMinutesOf(prefs) {
  return parseTimeOfDay(normalizePrefs(prefs).preferredStartTime)?.totalMinutes ?? 18 * 60;
}
