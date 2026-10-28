import test from "node:test";
import assert from "node:assert/strict";
import { fitRows, fitZone } from "./fit.js";
import { assessTasks } from "./engine/assess.js";
import { squeezeAnalysis } from "./engine/score.js";
import { normalizePrefs } from "./engine/config.js";

const now = new Date(2026, 9, 26, 9, 0);
const courses = [{ id: "c1", code: "CSC301", name: "Algorithms", priority: 4 }];
const task = (id, dueDate, extra = {}) => ({ id, courseId: "c1", title: id, type: "assignment", dueDate, dueTime: "12:00", estimatedHours: 4, importance: 3, status: "todo", ...extra });

test("worst row ratio equals the engine's squeeze ratio", () => {
  const tasks = [task("a", "2026-10-27"), task("b", "2026-10-28", { type: "test", estimatedHours: 9 }), task("c", "2026-11-03"), task("late", "2026-10-24")];
  const prefs = { dailyStudyHours: 2, availableDays: [0, 1, 2, 3, 4, 5, 6] };
  const { rows, overdueHours } = fitRows({ tasks, courses, prefs, now });
  const engine = squeezeAnalysis(assessTasks({ tasks, courses, now }).items, now, normalizePrefs(prefs));
  const worst = Math.max(...rows.map((r) => r.ratio));
  assert.ok(Math.abs(worst - engine.ratio) < 1e-9);
  assert.equal(overdueHours, 4);
  assert.equal(rows.length, 3); // overdue work is carried into demand, not listed as a row
});

test("demand is cumulative in deadline order and completed tasks are ignored", () => {
  const tasks = [task("a", "2026-10-27"), task("b", "2026-10-29"), task("done", "2026-10-28", { status: "completed" })];
  const { rows } = fitRows({ tasks, courses, prefs: {}, now });
  assert.deepEqual(rows.map((r) => r.demand), [4, 8]);
});

test("zones follow the warning thresholds", () => {
  assert.equal(fitZone(0.5), "low");
  assert.equal(fitZone(0.76), "high");
  assert.equal(fitZone(1.01), "critical");
});
