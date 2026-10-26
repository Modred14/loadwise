import { normalizePrefs } from "./config.js";
import { assessTasks, capacityHours } from "./assess.js";
import { squeezeAnalysis } from "./score.js";
import { toDateKey, toLocalDateTime } from "./dates.js";

export const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 };

const label = (i) => (i.course?.code ? `${i.task.title} (${i.course.code})` : i.task.title);
const fmtH = (h) => `${Math.round(h * 10) / 10}h`;
const inDays = (hours) => (hours < 24 ? "within 24 hours" : `in ${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? "" : "s"}`);

/**
 * Generates warnings from real task data. Every warning has a stable `key`
 * (same situation => same key) which is what makes persistence, dismissal and
 * deduplication possible; see reconcileWarnings().
 *
 * `plan` is optional: pass the result of generateStudyPlan() to also raise a
 * PLAN_INFEASIBLE warning when preparation cannot fit the student's hours.
 */
export function generateWarnings({ tasks = [], courses = [], prefs, now = new Date(), plan = null } = {}) {
  const p = normalizePrefs(prefs);
  const { items } = assessTasks({ tasks, courses, now });
  const out = [];

  // 1. Incomplete tasks that are past due.
  for (const i of items.filter((x) => x.overdue)) {
    out.push({
      key: `overdue:${i.task.id}`,
      code: "OVERDUE_TASK",
      severity: "critical",
      title: `${i.task.title} is overdue`,
      why: `This ${i.cfg.label.toLowerCase()} was due ${toDateKey(i.due)} and is not marked complete, so it still counts toward your workload.`,
      courseId: i.courseId,
      taskIds: [i.task.id],
      actionBy: toLocalDateTime(now),
      nextStep: "Complete it now, or speak to your lecturer about an extension, then update the task.",
    });
  }

  // 2. Not enough study time for a specific upcoming deadline (checked soonest first).
  let cumulative = items.filter((i) => i.overdue).reduce((a, i) => a + i.remainingHours, 0);
  for (const i of items.filter((x) => !x.overdue && x.hoursLeft <= 14 * 24)) {
    cumulative += i.remainingHours;
    const capacity = capacityHours(now, i.due, p);
    if (cumulative > capacity && i.remainingHours > 0) {
      out.push({
        key: `insufficient_time:${i.task.id}`,
        code: "INSUFFICIENT_PREP_TIME",
        severity: i.cfg.major || i.hoursLeft <= 72 ? "critical" : "warning",
        title: `Not enough study time before ${i.task.title}`,
        why: `You need about ${fmtH(cumulative)} of preparation to finish everything due by this deadline, but only about ${fmtH(capacity)} of study time is available.`,
        courseId: i.courseId,
        taskIds: [i.task.id],
        actionBy: toLocalDateTime(now),
        nextStep: "Start today, add study hours in your preferences, or move lower-priority work.",
      });
    }
  }

  // 3. Major exam/test approaching (informational heads-up).
  for (const i of items.filter((x) => !x.overdue && x.cfg.major && x.hoursLeft <= 7 * 24)) {
    out.push({
      key: `major_soon:${i.task.id}`,
      code: "MAJOR_ASSESSMENT_SOON",
      severity: i.hoursLeft <= 72 ? "warning" : "info",
      title: `${i.task.title} is ${inDays(i.hoursLeft)}`,
      why: `${i.cfg.label} for ${i.course?.name ?? "an unassigned course"} with about ${fmtH(i.remainingHours)} of preparation still to do.`,
      courseId: i.courseId,
      taskIds: [i.task.id],
      actionBy: toLocalDateTime(now),
      nextStep: "Schedule your revision sessions in the study planner.",
    });
  }

  // 4. Several deadlines in one 72-hour window.
  const upcoming = items.filter((i) => !i.overdue && i.hoursLeft <= 14 * 24);
  let cluster = null;
  for (const a of upcoming) {
    const group = upcoming.filter((b) => b.hoursLeft >= a.hoursLeft && b.hoursLeft <= a.hoursLeft + 72);
    if (group.length >= 3 && (!cluster || group.length > cluster.group.length)) cluster = { anchor: a, group };
  }
  if (cluster) {
    const majors = cluster.group.filter((g) => g.cfg.major).length;
    out.push({
      key: `cluster:${toDateKey(cluster.anchor.due)}`,
      code: "DEADLINE_CLUSTER",
      severity: majors >= 2 || cluster.group.length >= 4 ? "critical" : "warning",
      title: `${cluster.group.length} deadlines within 3 days`,
      why: `${cluster.group.map(label).join(", ")} all fall close together, so preparation will compete for the same time.`,
      courseId: null,
      taskIds: cluster.group.map((g) => g.task.id),
      actionBy: toLocalDateTime(now),
      nextStep: "Begin the earliest one now and split your study time across all of them.",
    });
  }

  // 5. Multiple deadlines on the same calendar day.
  const byDay = new Map();
  for (const i of upcoming) byDay.set(toDateKey(i.due), [...(byDay.get(toDateKey(i.due)) ?? []), i]);
  for (const [day, group] of byDay) {
    if (group.length >= 2) {
      out.push({
        key: `same_day:${day}`,
        code: "SAME_DAY_DEADLINES",
        severity: "warning",
        title: `${group.length} deadlines on ${day}`,
        why: `${group.map(label).join(" and ")} are due the same day.`,
        courseId: null,
        taskIds: group.map((g) => g.task.id),
        actionBy: toLocalDateTime(now),
        nextStep: "Finish preparation for one of them a day early.",
      });
    }
  }

  // 6. Overall capacity shortfall across the next two weeks.
  const sq = squeezeAnalysis(items, now, p);
  if (sq.ratio > 1 && !out.some((w) => w.code === "INSUFFICIENT_PREP_TIME")) {
    out.push({
      key: "capacity:14d",
      code: "CAPACITY_SHORTFALL",
      severity: "warning",
      title: "Workload exceeds your study capacity",
      why: `About ${fmtH(sq.demand)} of preparation is needed but only about ${fmtH(sq.capacity)} is available.`,
      courseId: null,
      taskIds: [],
      actionBy: toLocalDateTime(now),
      nextStep: "Increase your daily study hours or drop low-priority work.",
    });
  }

  // 7. The generated study plan cannot fit.
  if (plan && plan.conflicts?.length) {
    const missing = plan.conflicts.reduce((a, c) => a + c.missingMinutes, 0) / 60;
    out.push({
      key: "plan_infeasible",
      code: "PLAN_INFEASIBLE",
      severity: "critical",
      title: "Your study plan does not fit your available time",
      why: `${plan.conflicts.length} task${plan.conflicts.length === 1 ? "" : "s"} cannot be fully scheduled; about ${fmtH(missing)} of preparation is left unscheduled.`,
      courseId: null,
      taskIds: plan.conflicts.map((c) => c.taskId),
      actionBy: toLocalDateTime(now),
      nextStep: "Review the unscheduled tasks in the planner and adjust hours or priorities.",
    });
  }

  return out.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.actionBy.localeCompare(b.actionBy) || a.key.localeCompare(b.key),
  );
}

/**
 * Compares freshly generated warnings with persisted ones and says what the
 * backend must do. This is what prevents duplicates on every dashboard load.
 *
 * existing: [{ key, status: 'active'|'dismissed'|'resolved', severity, dismissedSeverity?, why, title }]
 * Returns { toCreate, toUpdate, toResolve }.
 *  - new key                      -> create
 *  - active, content changed      -> update (same row, no duplicate)
 *  - dismissed, same severity     -> leave dismissed
 *  - dismissed, severity escalated-> reactivate
 *  - resolved, condition returns  -> reactivate
 *  - active/dismissed, not generated any more -> resolve
 */
export function reconcileWarnings(existing = [], generated = []) {
  const byKey = new Map(existing.map((w) => [w.key, w]));
  const genKeys = new Set(generated.map((g) => g.key));
  const toCreate = [];
  const toUpdate = [];
  const toResolve = [];

  for (const g of generated) {
    const e = byKey.get(g.key);
    if (!e) {
      toCreate.push(g);
    } else if (e.status === "resolved") {
      toUpdate.push({ ...g, status: "active" });
    } else if (e.status === "dismissed") {
      const was = SEVERITY_RANK[e.dismissedSeverity ?? e.severity] ?? 0;
      if (SEVERITY_RANK[g.severity] > was) toUpdate.push({ ...g, status: "active" });
    } else if (e.severity !== g.severity || e.why !== g.why || e.title !== g.title) {
      toUpdate.push({ ...g, status: "active" });
    }
  }
  for (const e of existing) {
    if (e.status !== "resolved" && !genKeys.has(e.key)) toResolve.push(e.key);
  }
  return { toCreate, toUpdate, toResolve };
}
