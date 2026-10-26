import {
  CATEGORIES,
  CRUNCH_FULL_WEIGHT,
  CRUNCH_HORIZON_DAYS,
  CRUNCH_WINDOW_HOURS,
  OVERDUE_PENALTY_CAP,
  OVERDUE_PENALTY_EACH,
  SCORE_WEIGHTS,
  SQUEEZE_FLOOR,
  SQUEEZE_HORIZON_DAYS,
  SQUEEZE_SPAN,
  URGENCY_SATURATION,
  categoryFor,
  normalizePrefs,
} from "./config.js";
import { assessTasks, capacityHours } from "./assess.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

/** Urgency: how much weighted pressure sits close to now (0-100). */
function urgencyScore(items) {
  const sum = items.reduce((acc, i) => acc + i.pressure, 0);
  return 100 * (1 - Math.exp(-sum / URGENCY_SATURATION));
}

/**
 * Squeeze: can the preparation actually fit before each deadline? For every
 * deadline in the horizon we compare cumulative remaining hours (earliest
 * deadline first, plus any overdue work) with available study hours up to it.
 */
export function squeezeAnalysis(items, now, prefs) {
  const overdueHours = items.filter((i) => i.overdue).reduce((a, i) => a + i.remainingHours, 0);
  const upcoming = items.filter((i) => !i.overdue && i.hoursLeft <= SQUEEZE_HORIZON_DAYS * 24);
  let cumulative = overdueHours;
  let worst = { ratio: 0, item: null, demand: 0, capacity: 0 };
  for (const item of upcoming) {
    cumulative += item.remainingHours;
    const capacity = capacityHours(now, item.due, prefs);
    const ratio = cumulative / Math.max(capacity, 0.25);
    if (ratio > worst.ratio) worst = { ratio, item, demand: cumulative, capacity };
  }
  if (upcoming.length === 0 && overdueHours > 0) {
    const tomorrow = new Date(now.getTime() + 2 * 86_400_000);
    const capacity = capacityHours(now, tomorrow, prefs);
    worst = { ratio: overdueHours / Math.max(capacity, 0.25), item: null, demand: overdueHours, capacity };
  }
  const score = 100 * clamp((worst.ratio - SQUEEZE_FLOOR) / SQUEEZE_SPAN, 0, 1);
  return { score, ...worst };
}

/** Crunch: weighted deadlines inside the busiest rolling 72-hour window (0-100). */
export function crunchAnalysis(items) {
  const near = items.filter((i) => i.overdue || i.hoursLeft <= CRUNCH_HORIZON_DAYS * 24);
  const anchors = near.map((i) => (i.overdue ? 0 : i.hoursLeft));
  let best = { weight: 0, items: [] };
  for (const start of anchors) {
    const inWindow = near.filter((i) => {
      const h = i.overdue ? 0 : i.hoursLeft;
      return h >= start && h <= start + CRUNCH_WINDOW_HOURS;
    });
    const weight = inWindow.reduce((a, i) => a + i.weight, 0);
    if (weight > best.weight) best = { weight, items: inWindow };
  }
  return { score: 100 * clamp(best.weight / CRUNCH_FULL_WEIGHT, 0, 1), ...best };
}

function scoreItems(items, now, prefs) {
  if (items.length === 0) {
    return { score: 0, components: { urgency: 0, squeeze: 0, crunch: 0, overduePenalty: 0 }, squeeze: null, crunch: null };
  }
  const urgency = urgencyScore(items);
  const squeeze = squeezeAnalysis(items, now, prefs);
  const crunch = crunchAnalysis(items);
  const overdueCount = items.filter((i) => i.overdue).length;
  const overduePenalty = Math.min(OVERDUE_PENALTY_CAP, OVERDUE_PENALTY_EACH * overdueCount);
  const raw =
    SCORE_WEIGHTS.urgency * urgency + SCORE_WEIGHTS.squeeze * squeeze.score + SCORE_WEIGHTS.crunch * crunch.score;
  return {
    score: clamp(Math.round(raw + overduePenalty), 0, 100),
    components: {
      urgency: round1(urgency),
      squeeze: round1(squeeze.score),
      crunch: round1(crunch.score),
      overduePenalty,
    },
    squeeze,
    crunch,
  };
}

const dayWord = (hours) => {
  if (hours < 24) return "within 24 hours";
  const d = Math.floor(hours / 24);
  return d === 1 ? "in 1 day" : `in ${d} days`;
};
const label = (i) => (i.course?.code ? `${i.task.title} (${i.course.code})` : i.task.title);

function buildInsights(items, result, now, prefs) {
  const out = [];
  const overdue = items.filter((i) => i.overdue);
  if (overdue.length) {
    out.push({
      code: "OVERDUE",
      severity: "critical",
      text: `${overdue.length} incomplete ${overdue.length === 1 ? "task is" : "tasks are"} overdue: ${overdue
        .slice(0, 3)
        .map(label)
        .join(", ")}.`,
      taskIds: overdue.map((i) => i.task.id),
    });
  }
  const within3d = items.filter((i) => !i.overdue && i.hoursLeft <= 72);
  if (within3d.length >= 2) {
    out.push({
      code: "DEADLINES_CLUSTERED",
      severity: within3d.length >= 3 ? "critical" : "warning",
      text: `${within3d.length} deadlines fall within the next 3 days: ${within3d.slice(0, 3).map(label).join(", ")}.`,
      taskIds: within3d.map((i) => i.task.id),
    });
  }
  const majors = items.filter((i) => !i.overdue && i.cfg.major && i.hoursLeft <= 7 * 24);
  for (const m of majors.slice(0, 2)) {
    out.push({
      code: "MAJOR_APPROACHING",
      severity: m.hoursLeft <= 72 ? "warning" : "info",
      text: `${label(m)} is ${dayWord(m.hoursLeft)} and needs about ${m.remainingHours}h of preparation.`,
      taskIds: [m.task.id],
    });
  }
  const sq = result.squeeze;
  if (sq && sq.ratio > 1) {
    out.push({
      code: "NOT_ENOUGH_TIME",
      severity: "critical",
      text: `You need about ${round1(sq.demand)}h of preparation${
        sq.item ? ` before ${label(sq.item)}` : ""
      } but only have about ${round1(sq.capacity)}h of study time available.`,
      taskIds: sq.item ? [sq.item.task.id] : [],
    });
  } else if (sq && sq.ratio > 0.75) {
    out.push({
      code: "TIGHT_SCHEDULE",
      severity: "warning",
      text: `Your preparation needs use about ${Math.round(sq.ratio * 100)}% of the study time available before ${
        sq.item ? label(sq.item) : "your next deadline"
      }.`,
      taskIds: sq.item ? [sq.item.task.id] : [],
    });
  }
  const totalPressure = items.reduce((a, i) => a + i.pressure, 0);
  if (items.length >= 3 && totalPressure > 0) {
    const byCourse = new Map();
    for (const i of items) byCourse.set(i.courseId, (byCourse.get(i.courseId) ?? 0) + i.pressure);
    const [topId, topPressure] = [...byCourse.entries()].sort((a, b) => b[1] - a[1])[0];
    const course = items.find((i) => i.courseId === topId)?.course;
    if (course && topPressure / totalPressure >= 0.5 && byCourse.size > 1) {
      out.push({
        code: "COURSE_CONCENTRATION",
        severity: "info",
        text: `${Math.round((topPressure / totalPressure) * 100)}% of your current pressure comes from ${course.code ?? course.name}.`,
        taskIds: [],
      });
    }
  }
  if (items.length && out.length === 0) {
    const next = items.find((i) => !i.overdue);
    out.push({
      code: "WELL_SPREAD",
      severity: "info",
      text: next
        ? `Your deadlines are well spread out. The next is ${label(next)} ${dayWord(next.hoursLeft)}.`
        : "No upcoming deadlines.",
      taskIds: [],
    });
  }
  if (!items.length) {
    out.push({ code: "NO_ACTIVE_TASKS", severity: "info", text: "You have no active tasks, so your workload is clear.", taskIds: [] });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Deterministic workload score. Pure: identical inputs (including `now`)
 * always produce identical output. See docs/WORKLOAD_ENGINE.md.
 */
export function computeWorkload({ tasks = [], courses = [], prefs, now = new Date() } = {}) {
  const p = normalizePrefs(prefs);
  const { items, invalid, completedIgnored } = assessTasks({ tasks, courses, now });
  const result = scoreItems(items, now, p);
  const category = categoryFor(result.score);

  const courseIds = [...new Set(items.map((i) => i.courseId))];
  const perCourse = courseIds.map((id) => {
    const subset = items.filter((i) => i.courseId === id);
    const sub = scoreItems(subset, now, p);
    const upcoming7 = subset.filter((i) => !i.overdue && i.hoursLeft <= 7 * 24);
    return {
      courseId: id,
      course: subset[0].course,
      score: sub.score,
      category: categoryFor(sub.score).key,
      activeTasks: subset.length,
      overdueTasks: subset.filter((i) => i.overdue).length,
      remainingHours: round1(subset.reduce((a, i) => a + i.remainingHours, 0)),
      nextDue: subset.find((i) => !i.overdue)?.due ?? null,
      multipleUpcomingDeadlines: upcoming7.length >= 2,
    };
  });
  perCourse.sort((a, b) => b.score - a.score || String(a.courseId).localeCompare(String(b.courseId)));

  return {
    score: result.score,
    category: category.key,
    categoryLabel: category.label,
    components: result.components,
    counts: { active: items.length, overdue: items.filter((i) => i.overdue).length, completedIgnored, invalid: invalid.length },
    invalidTaskIds: invalid,
    totals: {
      remainingHours: round1(items.reduce((a, i) => a + i.remainingHours, 0)),
      capacityHours14d: round1(capacityHours(now, new Date(now.getTime() + 14 * 86_400_000), p)),
    },
    insights: buildInsights(items, result, now, p),
    perCourse,
    thresholds: CATEGORIES,
  };
}
