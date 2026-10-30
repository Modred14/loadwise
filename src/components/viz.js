import { CATEGORIES } from "@/lib/engine/config";
import { addDays, toDateKey } from "@/lib/engine";
import { fitRows } from "@/lib/fit";
import { cx } from "@/lib/cx";
import { formatDay, formatHours } from "@/lib/format";

const zoneOf = (score) => (CATEGORIES.find((c) => score >= c.min && score <= c.max) ?? CATEGORIES[0]).key;

/**
 * The load rail: 50 ticks (2 points each). Ticks up to the score are lit in their zone colour;
 * the rest stay faint so the thresholds are visible on the instrument itself.
 */
export function LoadRail({ score, labels = true, height, ticks = 100, className }) {
  const s = Math.max(0, Math.min(100, score));
  const step = 100 / ticks;
  return (
    <div className={className}>
      <div className="rail" data-count={ticks} style={{ ...(height ? { "--rail-h": height } : null), "--step": `${ticks === 100 ? 5 : 10}ms` }} aria-hidden>
        {Array.from({ length: ticks }, (_, i) => {
          const at = i * step; // lower bound of the points this tick represents
          return <i key={i} className={at % 10 === 0 ? "m10" : at % 5 === 0 ? "m5" : ""} data-zone={zoneOf(at + step / 2)} data-on={at < s ? "" : undefined} style={{ "--i": i }} />;
        })}
        <span className="rail-needle" style={{ "--p": s }} />
      </div>
      {labels ? (
        <div className="rail-zones" aria-hidden>
          {CATEGORIES.map((c) => <span key={c.key} style={{ left: `${c.min}%` }}>{c.label}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/** Big instrument readout: serif numeral, category, and the rail. Works on paper or inside .panel. */
export function ScoreMeter({ workload, size = "lg" }) {
  const { score, category, categoryLabel } = workload;
  const big = size === "lg";
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <span className={cx("t-num tnum", big ? "text-[5.5rem] sm:text-[7rem]" : "text-[3.5rem]")} role="img" aria-label={`Workload score ${score} out of 100, ${categoryLabel}`}>{score}</span>
        <div className="pb-2 sm:pb-3">
          <p className="t-label">of 100</p>
          <p className="mt-1.5 inline-flex items-center gap-2 text-sm font-semibold">
            <span className="size-2.5" style={{ background: `var(--zone-${category})` }} aria-hidden />
            {categoryLabel} load
          </p>
        </div>
      </div>
      <LoadRail score={score} className="mt-5" height={big ? "2.75rem" : "2rem"} />
    </div>
  );
}

/**
 * "Will it fit?": for each upcoming deadline, the preparation still needed against the
 * study time available before it. This is the engine's squeeze calculation, row by row.
 */
export function FitCheck({ tasks, courses, prefs, now, max = 6 }) {
  const { rows, overdueHours } = fitRows({ tasks, courses, prefs, now });
  const shown = rows.slice(0, max);
  const scale = Math.max(1, ...shown.map((r) => Math.max(r.demand, r.capacity)), overdueHours);
  if (shown.length === 0 && overdueHours === 0) {
    return <p className="t-small p-4">No deadlines in the next 14 days, so there is nothing to fit.</p>;
  }
  const WORD = { low: "Comfortable", high: "Tight", critical: "Will not fit" };
  return (
    <div>
      {overdueHours > 0 ? (
        <p className="border-b border-line bg-crit-soft/50 px-4 py-2.5 text-[0.8125rem] text-crit"><span className="font-semibold">Overdue backlog:</span> <span className="tnum">{formatHours(overdueHours)}</span> of preparation is already carried into every row below.</p>
      ) : null}
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r.item.task.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">{r.item.task.title}</p>
              <p className="t-small tnum shrink-0">{formatDay(r.item.task.dueDate)}</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5" role="img" aria-label={`${r.item.task.title}: ${formatHours(r.demand)} of preparation needed, ${formatHours(r.capacity)} of study time available. ${WORD[r.zone]}.`}>
              <div className="flex items-center gap-3">
                <span className="t-label w-14 shrink-0">Need</span>
                <div className="bar h-2 flex-1" data-zone={r.zone}><b style={{ width: `${(r.demand / scale) * 100}%` }} /></div>
                <span className="tnum w-12 shrink-0 text-right font-mono text-xs">{formatHours(r.demand)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="t-label w-14 shrink-0">Have</span>
                <div className="bar h-2 flex-1"><b style={{ width: `${(r.capacity / scale) * 100}%`, background: "var(--line-strong)" }} /></div>
                <span className="tnum w-12 shrink-0 text-right font-mono text-xs text-muted">{formatHours(r.capacity)}</span>
              </div>
            </div>
            <p className={cx("mt-1.5 text-xs font-medium", r.zone === "critical" ? "text-crit" : r.zone === "high" ? "text-warn" : "text-ok")}>
              {WORD[r.zone]} <span className="tnum font-normal text-muted">· {Math.round(r.ratio * 100)}% of available time</span>
            </p>
          </li>
        ))}
      </ul>
      {rows.length > shown.length ? <p className="t-small border-t border-line px-4 py-2.5">Showing the nearest {shown.length} of {rows.length} deadlines in the next 14 days.</p> : null}
    </div>
  );
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
/** Next 14 days at a glance: one column per day, one square per open deadline, bar = planned study. */
export function Fortnight({ tasks, sessions, prefs, now }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = toDateKey(today);
  const open = tasks.filter((t) => t.status !== "completed");
  const capMin = Math.max(prefs.dailyStudyHours * 60, 1);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    const key = toDateKey(d);
    const due = open.filter((t) => t.dueDate === key);
    const planned = sessions.filter((s) => s.date === key && s.status !== "skipped").reduce((a, s) => a + s.minutes, 0);
    return { d, key, due, planned, avail: prefs.availableDays.includes(d.getDay()) };
  });
  const overdue = open.filter((t) => t.dueDate < todayKey).length;
  const sq = (t) => (t.dueDate < todayKey ? "bg-crit" : t.type === "exam" || t.type === "test" ? "bg-[var(--zone-high)]" : "bg-[var(--zone-low)]");
  return (
    <div>
      <ol className="grid grid-cols-7 gap-px bg-line sm:grid-cols-14">
        {days.map(({ d, key, due, planned, avail }) => {
          const isToday = key === todayKey;
          return (
            <li key={key} aria-label={`${formatDay(key)}: ${due.length} deadline${due.length === 1 ? "" : "s"}${planned ? `, ${formatHours(planned / 60)} study planned` : ""}`} className={cx("flex min-h-28 flex-col bg-surface p-1.5", !avail && "bg-surface-2")}>
              <p className={cx("t-label text-center text-[0.625rem]", isToday && "text-primary")}>{DOW[d.getDay()]}</p>
              <p className={cx("tnum mx-auto mt-0.5 flex size-6 items-center justify-center text-xs", isToday ? "bg-ink font-semibold text-white" : avail ? "" : "text-muted")}>{d.getDate()}</p>
              <div className="mt-1.5 flex flex-1 flex-col items-center gap-1" aria-hidden>
                {due.slice(0, 3).map((t) => <span key={t.id} className={cx("block h-2 w-5", sq(t))} />)}
                {due.length > 3 ? <span className="font-mono text-[0.625rem] text-muted">+{due.length - 3}</span> : null}
              </div>
              <div className="mt-1 flex h-6 items-end justify-center" aria-hidden>
                <span className="block w-3 bg-line-strong" style={{ height: `${Math.min(100, Math.round((planned / capMin) * 100))}%`, minHeight: planned ? 2 : 0 }} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="t-small flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 bg-[var(--zone-high)]" aria-hidden />Exam or test</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 bg-[var(--zone-low)]" aria-hidden />Other deadline</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-2.5 bg-line-strong" aria-hidden />Planned study</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 border border-line bg-surface-2" aria-hidden />Day off</span>
        {overdue ? <span className="font-medium text-crit">{overdue} overdue not shown</span> : null}
      </div>
    </div>
  );
}
