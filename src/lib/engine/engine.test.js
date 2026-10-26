import test from "node:test";
import assert from "node:assert/strict";
import {
  computeWorkload,
  generateStudyPlan,
  generateWarnings,
  reconcileWarnings,
  categoryFor,
  parseDateOnly,
  dueInstant,
  capacityHours,
} from "./index.js";

const NOW = new Date(2026, 9, 25, 9, 0); // Sun 25 Oct 2026 09:00 local
const courses = [
  { id: "c1", code: "CS201", name: "Algorithms" },
  { id: "c2", code: "BIO110", name: "Cell Biology" },
  { id: "c3", code: "ENG310", name: "Writing" },
];
const task = (id, over = {}) => ({
  id, courseId: "c1", title: `Task ${id}`, type: "assignment", dueDate: "2026-11-20", status: "todo", ...over,
});

test("new student with no tasks scores 0 / Low with a clear insight", () => {
  const w = computeWorkload({ tasks: [], courses: [], now: NOW });
  assert.equal(w.score, 0);
  assert.equal(w.category, "low");
  assert.equal(w.insights[0].code, "NO_ACTIVE_TASKS");
});

test("category thresholds are consistent at the boundaries", () => {
  assert.equal(categoryFor(29).key, "low");
  assert.equal(categoryFor(30).key, "medium");
  assert.equal(categoryFor(54).key, "medium");
  assert.equal(categoryFor(55).key, "high");
  assert.equal(categoryFor(74).key, "high");
  assert.equal(categoryFor(75).key, "critical");
  assert.equal(categoryFor(100).key, "critical");
});

test("identical inputs give identical output (deterministic)", () => {
  const tasks = [task("a", { type: "exam", dueDate: "2026-10-28" }), task("b", { dueDate: "2026-10-30" })];
  assert.deepEqual(computeWorkload({ tasks, courses, now: NOW }), computeWorkload({ tasks, courses, now: NOW }));
});

test("same tasks packed into 2 days score higher than spread over weeks", () => {
  const pack = ["2026-10-27", "2026-10-27", "2026-10-28"].map((d, i) => task(`p${i}`, { type: "exam", dueDate: d, courseId: `c${i + 1}` }));
  const spread = ["2026-11-03", "2026-11-12", "2026-11-22"].map((d, i) => task(`s${i}`, { type: "exam", dueDate: d, courseId: `c${i + 1}` }));
  const a = computeWorkload({ tasks: pack, courses, now: NOW });
  const b = computeWorkload({ tasks: spread, courses, now: NOW });
  assert.ok(a.score > b.score + 30, `${a.score} vs ${b.score}`);
  assert.equal(a.category, "critical");
});

test("a major exam approaching soon is explained in insights", () => {
  const w = computeWorkload({ tasks: [task("e", { type: "exam", title: "Algorithms Exam", dueDate: "2026-10-28", dueTime: "10:00" })], courses, now: NOW });
  assert.ok(w.insights.some((i) => i.code === "MAJOR_APPROACHING" && i.text.includes("Algorithms Exam")));
});

test("completed tasks do not contribute to workload", () => {
  const tasks = [task("a", { type: "exam", dueDate: "2026-10-27" }), task("b", { type: "exam", dueDate: "2026-10-27" })];
  const before = computeWorkload({ tasks, courses, now: NOW });
  const done = computeWorkload({ tasks: tasks.map((t) => ({ ...t, status: "completed" })), courses, now: NOW });
  assert.ok(before.score > 40);
  assert.equal(done.score, 0);
  assert.equal(done.counts.completedIgnored, 2);
});

test("duplicate task ids are counted once", () => {
  const t = task("a", { type: "exam", dueDate: "2026-10-27" });
  assert.equal(computeWorkload({ tasks: [t, { ...t }], courses, now: NOW }).score, computeWorkload({ tasks: [t], courses, now: NOW }).score);
});

test("overdue incomplete task is flagged, kept in workload, and warned about", () => {
  const tasks = [task("late", { dueDate: "2026-10-23", title: "Lab report" })];
  const w = computeWorkload({ tasks, courses, now: NOW });
  assert.equal(w.counts.overdue, 1);
  assert.ok(w.score > 0);
  assert.equal(w.insights[0].code, "OVERDUE");
  const warn = generateWarnings({ tasks, courses, now: NOW });
  assert.ok(warn.some((x) => x.key === "overdue:late" && x.severity === "critical"));
});

test("a task due today with no time is not overdue until the day ends", () => {
  const w = computeWorkload({ tasks: [task("t", { dueDate: "2026-10-25" })], courses, now: NOW });
  assert.equal(w.counts.overdue, 0);
});

test("dates parse as local calendar days, not UTC", () => {
  const d = parseDateOnly("2026-10-25");
  assert.equal(d.getDate(), 25);
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(dueInstant("2026-10-25", "25:00"), null);
  assert.equal(dueInstant("2026-10-25", "14:30").getHours(), 14);
});

test("invalid task dates are reported, not guessed", () => {
  const w = computeWorkload({ tasks: [task("bad", { dueDate: "tomorrow" })], courses, now: NOW });
  assert.deepEqual(w.invalidTaskIds, ["bad"]);
  assert.equal(w.score, 0);
});

test("capacity respects available days and daily hours", () => {
  const due = new Date(2026, 9, 28, 9, 0); // Sun..Wed
  assert.equal(capacityHours(NOW, due, { dailyStudyHours: 2 }), 2 + 2 + 2 + 1);
  assert.equal(capacityHours(NOW, due, { dailyStudyHours: 2, availableDays: [1] }), 2); // Monday only
});

test("insufficient study time raises critical warnings and a NOT_ENOUGH_TIME insight", () => {
  const tasks = [task("x", { type: "exam", dueDate: "2026-10-26", dueTime: "09:00", estimatedHours: 10 })];
  const w = computeWorkload({ tasks, courses, now: NOW });
  assert.ok(w.insights.some((i) => i.code === "NOT_ENOUGH_TIME"));
  const warn = generateWarnings({ tasks, courses, now: NOW });
  assert.ok(warn.some((x) => x.code === "INSUFFICIENT_PREP_TIME" && x.severity === "critical"));
});

test("warnings carry what, why, affected items, when and next step", () => {
  const warn = generateWarnings({ tasks: [task("late", { dueDate: "2026-10-20" })], courses, now: NOW });
  for (const f of ["title", "why", "taskIds", "actionBy", "nextStep", "severity", "key"]) assert.ok(warn[0][f] !== undefined, f);
});

test("clustered and same-day deadlines are detected", () => {
  const tasks = [
    task("a", { type: "exam", dueDate: "2026-10-27", courseId: "c1" }),
    task("b", { type: "test", dueDate: "2026-10-27", courseId: "c2" }),
    task("c", { dueDate: "2026-10-28", courseId: "c3" }),
  ];
  const keys = generateWarnings({ tasks, courses, now: NOW }).map((w) => w.code);
  assert.ok(keys.includes("DEADLINE_CLUSTER"));
  assert.ok(keys.includes("SAME_DAY_DEADLINES"));
});

test("reconcile: no duplicates on refresh, updates in place, resolves, respects dismissal", () => {
  const g1 = generateWarnings({ tasks: [task("late", { dueDate: "2026-10-20" })], courses, now: NOW });
  const first = reconcileWarnings([], g1);
  assert.equal(first.toCreate.length, g1.length);
  const persisted = g1.map((g) => ({ ...g, status: "active" }));
  const again = reconcileWarnings(persisted, g1);
  assert.deepEqual([again.toCreate.length, again.toUpdate.length, again.toResolve.length], [0, 0, 0]);
  const dismissed = persisted.map((w) => ({ ...w, status: "dismissed", dismissedSeverity: w.severity }));
  assert.equal(reconcileWarnings(dismissed, g1).toUpdate.length, 0);
  const escalated = dismissed.map((w) => ({ ...w, dismissedSeverity: "info" }));
  assert.equal(reconcileWarnings(escalated, g1).toUpdate.length, g1.length);
  assert.deepEqual(reconcileWarnings(persisted, []).toResolve, g1.map((g) => g.key));
});

// ---------- planner ----------

const planTasks = [
  task("exam", { type: "exam", title: "Exam", dueDate: "2026-10-30", dueTime: "09:00", estimatedHours: 6, importance: 5 }),
  task("asg", { courseId: "c2", dueDate: "2026-11-02", estimatedHours: 3 }),
];

test("plan never schedules in the past, over capacity, or overlapping", () => {
  const plan = generateStudyPlan({ tasks: planTasks, courses, prefs: { dailyStudyHours: 2 }, now: NOW });
  assert.ok(plan.sessions.length > 0);
  const byDay = new Map();
  for (const s of plan.sessions) {
    assert.ok(s.startsAt >= "2026-10-25T09:00", `in the past: ${s.startsAt}`);
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.minutes);
  }
  for (const [, m] of byDay) assert.ok(m <= 120, `over capacity ${m}`);
  const sorted = [...plan.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].startsAt >= sorted[i - 1].endsAt, "overlap");
});

test("sessions are finished before their deadline and sessions honour max length and breaks", () => {
  const plan = generateStudyPlan({ tasks: planTasks, courses, prefs: { maxSessionMinutes: 60, breakMinutes: 15 }, now: NOW });
  for (const s of plan.sessions) {
    assert.ok(s.minutes <= 60);
    if (s.taskId === "exam") assert.ok(s.date < "2026-10-30");
  }
  const day = plan.sessions.filter((s) => s.date === "2026-10-26").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < day.length; i++) {
    const gap = (new Date(day[i].startsAt) - new Date(day[i - 1].endsAt)) / 60000;
    assert.ok(gap >= 15, `break too short: ${gap}`);
  }
});

test("a feasible plan schedules the full estimated time", () => {
  const plan = generateStudyPlan({ tasks: planTasks, courses, now: NOW });
  assert.equal(plan.feasible, true);
  assert.equal(plan.summary.plannedMinutes, (6 + 3) * 60);
});

test("insufficient time is reported honestly and the important task is protected", () => {
  const tasks = [
    task("big", { type: "exam", dueDate: "2026-10-27", dueTime: "09:00", estimatedHours: 12, importance: 5 }),
    task("minor", { courseId: "c2", dueDate: "2026-10-27", dueTime: "09:00", estimatedHours: 4, importance: 1, type: "other" }),
  ];
  const plan = generateStudyPlan({ tasks, courses, prefs: { dailyStudyHours: 2 }, now: NOW });
  assert.equal(plan.feasible, false);
  const planned = (id) => plan.sessions.filter((s) => s.taskId === id).reduce((a, s) => a + s.minutes, 0);
  assert.ok(planned("big") >= planned("minor"));
  assert.ok(plan.sessions.reduce((a, s) => a + s.minutes, 0) <= 4 * 60 + 1);
  const warn = generateWarnings({ tasks, courses, now: NOW, plan });
  assert.ok(warn.some((w) => w.code === "PLAN_INFEASIBLE"));
});

test("regenerating preserves completed sessions and does not re-plan finished work", () => {
  const first = generateStudyPlan({ tasks: planTasks, courses, now: NOW });
  const completed = { ...first.sessions[0], status: "completed" };
  const second = generateStudyPlan({ tasks: planTasks, courses, existingSessions: [completed, ...first.sessions.slice(1)], now: NOW });
  const total = (id) => second.sessions.filter((s) => s.taskId === id).reduce((a, s) => a + s.minutes, 0);
  const target = completed.taskId === "exam" ? 360 : 180;
  assert.equal(total(completed.taskId) + completed.minutes, target);
  assert.equal(second.summary.preservedCompletedSessions, 1);
  assert.ok(!second.sessions.some((s) => s.startsAt < completed.endsAt && s.endsAt > completed.startsAt));
});

test("completed tasks are not scheduled and unavailable days stay empty", () => {
  const tasks = [{ ...planTasks[0], status: "completed" }, planTasks[1]];
  const plan = generateStudyPlan({ tasks, courses, prefs: { availableDays: [1, 3] }, now: NOW });
  assert.ok(plan.sessions.every((s) => s.taskId !== "exam"));
  assert.ok(plan.sessions.every((s) => [1, 3].includes(parseDateOnly(s.date).getDay())));
});

test("late in the day, today's capacity shrinks to what is left", () => {
  const late = new Date(2026, 9, 25, 22, 40);
  const plan = generateStudyPlan({ tasks: planTasks, courses, now: late });
  assert.ok(plan.sessions.filter((s) => s.date === "2026-10-25").every((s) => s.endsAt <= "2026-10-25T23:30"));
});

test("overdue work is caught up first", () => {
  const tasks = [task("late", { dueDate: "2026-10-22", estimatedHours: 2 }), planTasks[1]];
  const plan = generateStudyPlan({ tasks, courses, now: NOW });
  assert.equal(plan.sessions[0].taskId, "late");
  assert.ok(plan.sessions[0].reason.startsWith("Overdue"));
});

test("planner is deterministic", () => {
  assert.deepEqual(generateStudyPlan({ tasks: planTasks, courses, now: NOW }), generateStudyPlan({ tasks: planTasks, courses, now: NOW }));
});
