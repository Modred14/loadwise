// All tunable constants for the workload engine live here so the scoring is
// transparent and documented in one place (see docs/WORKLOAD_ENGINE.md).

export const TASK_TYPES = ["test", "assignment", "continuous_assessment", "exam", "project", "other"];

export const TYPE_CONFIG = {
  exam: { label: "Examination", weight: 1.0, defaultHours: 8, major: true },
  test: { label: "Test", weight: 0.8, defaultHours: 4, major: true },
  project: { label: "Project", weight: 0.8, defaultHours: 10, major: false },
  continuous_assessment: { label: "Continuous assessment", weight: 0.7, defaultHours: 3, major: false },
  assignment: { label: "Assignment", weight: 0.6, defaultHours: 3, major: false },
  other: { label: "Other deadline", weight: 0.4, defaultHours: 2, major: false },
};

// Importance / priority are integers 1 (low) to 5 (critical); 3 is neutral.
export const IMPORTANCE_MULTIPLIER = { 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3 };
export const COURSE_PRIORITY_MULTIPLIER = { 1: 0.9, 2: 0.95, 3: 1.0, 4: 1.05, 5: 1.1 };

export const CATEGORIES = [
  { key: "low", label: "Low", min: 0, max: 29 },
  { key: "medium", label: "Medium", min: 30, max: 54 },
  { key: "high", label: "High", min: 55, max: 74 },
  { key: "critical", label: "Critical", min: 75, max: 100 },
];

export const SCORE_WEIGHTS = { urgency: 0.4, squeeze: 0.35, crunch: 0.25 };

export const URGENCY_HALF_LIFE_HOURS = 72; // u = 1 / (1 + hoursLeft / 72)
export const URGENCY_SATURATION = 2; // urgency = 100 * (1 - exp(-sum / 2))
export const SQUEEZE_HORIZON_DAYS = 14;
export const SQUEEZE_FLOOR = 0.25; // demand/capacity ratio that starts to count
export const SQUEEZE_SPAN = 0.85; // ratio of FLOOR+SPAN (=1.10) scores 100
export const CRUNCH_WINDOW_HOURS = 72;
export const CRUNCH_HORIZON_DAYS = 14;
export const CRUNCH_FULL_WEIGHT = 3; // weighted deadlines in one window = 100
export const OVERDUE_PENALTY_EACH = 5;
export const OVERDUE_PENALTY_CAP = 15;

export const DEFAULT_PREFS = {
  dailyStudyHours: 3,
  availableDays: [0, 1, 2, 3, 4, 5, 6], // 0 = Sunday
  maxSessionMinutes: 90,
  breakMinutes: 10,
  preferredStartTime: "18:00",
};

export function normalizePrefs(input = {}) {
  const p = { ...DEFAULT_PREFS, ...(input || {}) };
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const days = Array.isArray(p.availableDays)
    ? [...new Set(p.availableDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : DEFAULT_PREFS.availableDays;
  return {
    dailyStudyHours: num(p.dailyStudyHours, DEFAULT_PREFS.dailyStudyHours, 0, 16),
    availableDays: days,
    maxSessionMinutes: Math.round(num(p.maxSessionMinutes, DEFAULT_PREFS.maxSessionMinutes, 30, 240)),
    breakMinutes: Math.round(num(p.breakMinutes, DEFAULT_PREFS.breakMinutes, 0, 60)),
    preferredStartTime: /^\d{2}:\d{2}$/.test(p.preferredStartTime) ? p.preferredStartTime : DEFAULT_PREFS.preferredStartTime,
  };
}

export function categoryFor(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return CATEGORIES.find((c) => s >= c.min && s <= c.max) ?? CATEGORIES[0];
}
