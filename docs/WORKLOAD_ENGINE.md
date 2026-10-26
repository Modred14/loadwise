# LoadWise workload engine

Code: `src/lib/engine/`. Everything is pure and deterministic: the same tasks, courses, preferences and `now` always give the same result. Run `npm test`.

The score is a **practical workload indicator** computed from the information the student entered. It is not a validated prediction of academic outcomes.

## Conventions
- Dates are local wall-clock values in the student's timezone: `YYYY-MM-DD` and `HH:mm`. They are built from numeric parts, never `new Date("YYYY-MM-DD")`, which is parsed as UTC and shifts deadlines by a day in some timezones.
- A task with no `dueTime` is due at 23:59 that day (not overdue until the day ends).
- Completed tasks (`status === "completed"` or `completedAt` set) never contribute. Duplicate task ids count once. Tasks with unparseable dates are excluded and listed in `invalidTaskIds`, never guessed.

## Inputs per task
`type`, `dueDate`, `dueTime?`, `estimatedHours?` (default by type), `studiedHours?`, `importance` 1-5 (default 3), plus the course's `priority` 1-5 (default 3).

| Type | Weight | Default hours | Major |
|---|---|---|---|
| exam | 1.0 | 8 | yes |
| test | 0.8 | 4 | yes |
| project | 0.8 | 10 | no |
| continuous_assessment | 0.7 | 3 | no |
| assignment | 0.6 | 3 | no |
| other | 0.4 | 2 | no |

Importance multiplier: 1→0.7, 2→0.85, 3→1.0, 4→1.15, 5→1.3. Course priority multiplier: 0.9, 0.95, 1.0, 1.05, 1.1.
`weight = typeWeight × importanceMultiplier × coursePriorityMultiplier`.

## Score (0-100)
`score = round(0.40·urgency + 0.35·squeeze + 0.25·crunch + overduePenalty)`, clamped to 0-100.

1. **Urgency** (how much weighted pressure is close): each task contributes `weight × 1/(1 + hoursLeft/72)` (overdue tasks use factor 1). Summed, then saturated: `100 × (1 − e^(−sum/2))`.
2. **Squeeze** (can the preparation fit?): deadlines in the next 14 days sorted soonest first. For each, `ratio = cumulative remaining hours (plus overdue hours) / study hours available before it`. Worst ratio maps to `100 × clamp((ratio − 0.25) / 0.85, 0, 1)`, so a ratio of 1.10 or more scores 100.
3. **Crunch** (overlap): the busiest rolling 72-hour window in the next 14 days. Sum of `weight` inside it, `100 × min(1, sum/3)`.
4. **Overdue penalty**: +5 per overdue incomplete task, capped at +15.

Available study hours: `dailyStudyHours` on each `availableDays` weekday from today to the due day; the due day counts half. Today counts in full here (the planner is stricter because it knows the clock time).

## Categories (used everywhere in the app)
| Category | Score |
|---|---|
| Low | 0-29 |
| Medium | 30-54 |
| High | 55-74 |
| Critical | 75-100 |

## Insights
`computeWorkload().insights` are generated from the student's actual tasks: overdue tasks, deadline clusters (2+ in 3 days), major assessments within 7 days, not-enough-time and tight-schedule, and course concentration (one course ≥ 50% of pressure). If none apply and tasks exist, it says deadlines are well spread.

## Warnings (`generateWarnings`)
Each has a stable `key`, `severity` (info/warning/critical), `title` (what), `why`, `courseId`/`taskIds` (affected), `actionBy` (when), `nextStep`.
- `OVERDUE_TASK`: critical, one per overdue incomplete task.
- `INSUFFICIENT_PREP_TIME`: cumulative preparation exceeds study time available before a deadline within 14 days; critical for exams/tests or deadlines within 72h.
- `MAJOR_ASSESSMENT_SOON`: exam/test within 7 days (warning within 72h, else info).
- `DEADLINE_CLUSTER`: 3+ deadlines in a 72h window (critical with 2+ major or 4+ total).
- `SAME_DAY_DEADLINES`: 2+ deadlines on one calendar day.
- `CAPACITY_SHORTFALL`: overall demand exceeds capacity, when no per-task warning already says so.
- `PLAN_INFEASIBLE`: the generated plan has unscheduled work (pass the plan in).

`reconcileWarnings(existing, generated)` returns `{toCreate, toUpdate, toResolve}` so the backend never duplicates warnings: same key updates in place, dismissed stays dismissed unless severity escalates, and warnings whose condition disappeared are resolved.

## Study planner (`generateStudyPlan`)
1. Completed sessions are kept, counted as progress and block their time slots. All other existing sessions are discarded and re-planned.
2. Each task's remaining time = estimate − max(`studiedHours`, completed session minutes).
3. Window: from up to 14 days before the deadline until the day before it (or later today if due more than 30 minutes from now). Overdue tasks must be caught up within 3 days and are scheduled first.
4. Day by day, tasks get an even share of their remaining time over their remaining available days (minimum 30 min). Tasks with the least slack and highest weight are served first. Tight tasks (remaining/capacity > 0.6) take leftover capacity to get ahead.
5. Time placement starts at `preferredStartTime` (today: after now, rounded up to 15 min), splits into sessions of at most `maxSessionMinutes`, inserts `breakMinutes` between sessions, avoids completed sessions, and never goes past 23:30.
6. Work that cannot fit is returned in `conflicts` with `missingMinutes`; the plan is never padded to look feasible.

## Limitations
Estimates are the student's (or defaults by type). Difficulty is only reflected via importance and course priority. The 3-day crunch window, 14-day horizon and all weights are judgement calls collected in `config.js` for tuning. Study capacity ignores classes and other commitments.
