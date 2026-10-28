// Per-deadline view of the engine's "squeeze" calculation (see squeezeAnalysis in
// engine/score.js): for each upcoming deadline, the cumulative preparation still needed
// versus the study hours available before it. Read-only; it never alters scoring.
import { SQUEEZE_HORIZON_DAYS, assessTasks, capacityHours, normalizePrefs } from "./engine/index.js";

/** ratio <= 0.75 comfortable, <= 1 tight, > 1 will not fit (same thresholds as the warnings). */
export const fitZone = (ratio) => (ratio > 1 ? "critical" : ratio > 0.75 ? "high" : "low");

export function fitRows({ tasks = [], courses = [], prefs, now }) {
  const p = normalizePrefs(prefs);
  const { items } = assessTasks({ tasks, courses, now });
  const overdueHours = items.filter((i) => i.overdue).reduce((a, i) => a + i.remainingHours, 0);
  let cumulative = overdueHours;
  const rows = [];
  for (const item of items.filter((i) => !i.overdue && i.hoursLeft <= SQUEEZE_HORIZON_DAYS * 24)) {
    cumulative += item.remainingHours;
    const capacity = capacityHours(now, item.due, p);
    const ratio = cumulative / Math.max(capacity, 0.25);
    rows.push({ item, demand: cumulative, capacity, ratio, zone: fitZone(ratio) });
  }
  return { rows, overdueHours };
}
