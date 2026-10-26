import { normalizePrefs } from "./config.js";
import { assessTasks, startMinutesOf } from "./assess.js";
import {
  addDays,
  atMinutes,
  calendarDaysBetween,
  minutesOfDay,
  parseDateOnly,
  startOfDay,
  toDateKey,
  toLocalDateTime,
} from "./dates.js";

const SLOT = 15; // scheduling granularity in minutes
const MIN_SESSION = 30;
const DAY_END = 23 * 60 + 30; // never schedule past 23:30
const WINDOW_DAYS = 14; // prepare at most this many days before a deadline
const CATCH_UP_DAYS = 3; // overdue work must be caught up within this window

const ceilTo = (v, step) => Math.ceil(v / step) * step;

function parseLocalDateTime(value) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const day = parseDateOnly(m[1]);
  return day ? atMinutes(day, Number(m[2]) * 60 + Number(m[3])) : null;
}

function reasonFor(item, remainingMin, now) {
  const parts = [];
  if (item.overdue) parts.push("Overdue, so catching up comes first");
  else {
    const d = Math.floor(item.hoursLeft / 24);
    parts.push(`${item.cfg.label} due ${d < 1 ? "within 24 hours" : `in ${d} day${d === 1 ? "" : "s"}`}`);
  }
  if (item.importance >= 4) parts.push("marked high importance");
  if (item.coursePriority >= 4) parts.push("high-priority course");
  parts.push(`${Math.round((remainingMin / 60) * 10) / 10}h of preparation still needed`);
  return parts.join("; ") + ".";
}

/**
 * Deterministic study-plan generator.
 *
 * Input sessions with status 'completed' are preserved and counted as progress;
 * every other existing session is discarded and re-planned (that is what
 * "regenerate" means). Returns only the newly planned sessions plus conflicts.
 *
 * Session shape: { id, taskId, courseId, date, startsAt, endsAt, minutes,
 *                  status: 'planned', reason }
 */
export function generateStudyPlan({ tasks = [], courses = [], prefs, existingSessions = [], now = new Date(), horizonDays = 28 } = {}) {
  const p = normalizePrefs(prefs);
  const { items } = assessTasks({ tasks, courses, now });
  const today = startOfDay(now);

  // Completed sessions count as progress and block their time slots.
  const done = (existingSessions || []).filter((s) => s.status === "completed");
  const doneByTask = new Map();
  const busyByDay = new Map(); // dateKey -> [{start,end}] in minutes
  const doneMinutesByDay = new Map();
  for (const s of done) {
    doneByTask.set(s.taskId, (doneByTask.get(s.taskId) ?? 0) + (s.minutes || 0));
    const start = parseLocalDateTime(s.startsAt);
    if (start) {
      const key = toDateKey(start);
      const startMin = minutesOfDay(start);
      busyByDay.set(key, [...(busyByDay.get(key) ?? []), { start: startMin, end: startMin + (s.minutes || 0) }]);
      doneMinutesByDay.set(key, (doneMinutesByDay.get(key) ?? 0) + (s.minutes || 0));
    }
  }

  // Per-day capacity (minutes) and availability.
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const key = toDateKey(date);
    let cap = p.availableDays.includes(date.getDay()) ? Math.round(p.dailyStudyHours * 60) : 0;
    cap = Math.max(0, cap - (doneMinutesByDay.get(key) ?? 0));
    let start = startMinutesOf(p);
    if (i === 0) {
      start = Math.max(start, ceilTo(minutesOfDay(now), SLOT));
      cap = Math.min(cap, Math.max(0, DAY_END - start));
    }
    days.push({ date, key, cap: ceilTo(cap, 1) >= MIN_SESSION ? cap : 0, start });
  }

  // Planning window for each task.
  const work = [];
  for (const item of items) {
    const studiedMin = Math.max((Number(item.task.studiedHours) || 0) * 60, doneByTask.get(item.task.id) ?? 0);
    const remaining = Math.max(0, Math.round(item.estimatedHours * 60 - studiedMin));
    if (remaining === 0) continue;
    let last;
    if (item.overdue) last = CATCH_UP_DAYS - 1;
    else {
      const dueIdx = calendarDaysBetween(today, item.dueDay);
      last = dueIdx - 1;
      if (dueIdx === 0 && item.due.getTime() - now.getTime() > 30 * 60_000) last = 0; // due later today
    }
    last = Math.min(last, horizonDays - 1);
    if (last < 0) {
      work.push({ item, remaining, first: 0, last: -1, skipped: true });
      continue;
    }
    const first = Math.max(0, last - (WINDOW_DAYS - 1));
    if (first >= horizonDays) continue;
    work.push({ item, remaining, first, last, skipped: false });
  }

  const planned = [];
  const used = days.map(() => ({ allocations: [] }));

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    if (day.cap <= 0) continue;
    const eligible = work.filter((w) => !w.skipped && w.remaining > 0 && d >= w.first && d <= w.last);
    if (!eligible.length) continue;

    const slack = (w) => {
      let capLeft = 0;
      for (let k = d; k <= w.last; k++) capLeft += days[k].cap;
      return capLeft === 0 ? Infinity : w.remaining / capLeft;
    };
    const order = (a, b) =>
      slack(b) - slack(a) ||
      b.item.weight - a.item.weight ||
      a.item.due - b.item.due ||
      String(a.item.task.id).localeCompare(String(b.item.task.id));
    eligible.sort((a, b) => (a.item.overdue === b.item.overdue ? order(a, b) : a.item.overdue ? -1 : 1));

    let capLeft = day.cap;
    const give = (w, minutes) => {
      const amount = Math.min(minutes, capLeft, w.remaining);
      if (amount <= 0) return;
      const existing = used[d].allocations.find((a) => a.w === w);
      if (existing) existing.minutes += amount;
      else used[d].allocations.push({ w, minutes: amount });
      w.remaining -= amount;
      capLeft -= amount;
    };

    // Pass 1: an even share of each task's remaining time over its remaining available days.
    for (const w of eligible) {
      let availDays = 0;
      for (let k = d; k <= w.last; k++) if (days[k].cap > 0) availDays++;
      let share = ceilTo(w.remaining / Math.max(1, availDays), SLOT);
      share = Math.max(share, Math.min(w.remaining, MIN_SESSION));
      give(w, share);
    }
    // Pass 2: tasks that are tight on time get any leftover capacity so they get ahead.
    for (const w of eligible) {
      if (capLeft <= 0) break;
      if (w.remaining > 0 && slack(w) > 0.6) give(w, w.remaining);
    }
  }

  // Lay allocations out in time, chunked into sessions with breaks.
  const sessions = [];
  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const allocations = used[d].allocations;
    if (!allocations.length) continue;
    const busy = busyByDay.get(day.key) ?? [];
    let cursor = day.start;
    let n = 0;
    let first = true;
    for (const alloc of allocations) {
      let left = alloc.minutes;
      while (left > 0) {
        let length = Math.min(left, p.maxSessionMinutes);
        if (!first) cursor += p.breakMinutes;
        // Step past any completed session that would overlap.
        for (const b of [...busy].sort((x, y) => x.start - y.start)) {
          if (cursor < b.end && cursor + length > b.start) cursor = b.end;
        }
        if (cursor + length > DAY_END) length = Math.floor((DAY_END - cursor) / SLOT) * SLOT;
        if (length < Math.min(MIN_SESSION, left)) {
          alloc.w.remaining += left; // could not place: return to the task
          left = 0;
          break;
        }
        const start = atMinutes(day.date, cursor);
        const end = atMinutes(day.date, cursor + length);
        sessions.push({
          id: `${alloc.w.item.task.id}:${day.key}:${n++}`,
          taskId: alloc.w.item.task.id,
          courseId: alloc.w.item.courseId,
          date: day.key,
          startsAt: toLocalDateTime(start),
          endsAt: toLocalDateTime(end),
          minutes: length,
          status: "planned",
          reason: reasonFor(alloc.w.item, alloc.w.remaining + left, now),
        });
        cursor += length;
        left -= length;
        first = false;
      }
    }
  }

  sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || String(a.taskId).localeCompare(String(b.taskId)));

  const conflicts = work
    .filter((w) => w.remaining > 0)
    .map((w) => ({
      taskId: w.item.task.id,
      courseId: w.item.courseId,
      title: w.item.task.title,
      missingMinutes: w.remaining,
      reason: w.skipped
        ? "The deadline is too close to schedule any preparation time."
        : "Not enough available study time before the deadline.",
    }))
    .sort((a, b) => b.missingMinutes - a.missingMinutes || String(a.taskId).localeCompare(String(b.taskId)));

  return {
    sessions,
    conflicts,
    feasible: conflicts.length === 0,
    summary: {
      plannedMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
      unscheduledMinutes: conflicts.reduce((a, c) => a + c.missingMinutes, 0),
      preservedCompletedSessions: done.length,
    },
  };
}

/** Which planned sessions are affected when a task's deadline or estimate changes. */
export function sessionsAffectedByTaskChange(sessions, taskId) {
  return (sessions || []).filter((s) => s.taskId === taskId && s.status !== "completed");
}
