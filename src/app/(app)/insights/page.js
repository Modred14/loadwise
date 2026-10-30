"use client";
import { Badge, Card, CardHead, PageHeader, Progress, SeverityBadge, cx } from "@/components/ui";
import { CourseTag, ReadyGate } from "@/components/domain";
import { ScoreMeter } from "@/components/viz";
import { useData } from "@/lib/store";
import { SCORE_WEIGHTS } from "@/lib/engine/config";
import { formatDay, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

const PARTS = [
  { key: "urgency", label: "Urgency", color: "var(--zone-high)", help: "How much weighted work sits close to now." },
  { key: "squeeze", label: "Time squeeze", color: "var(--zone-medium)", help: "Whether preparation fits the study hours available before each deadline." },
  { key: "crunch", label: "Overlap", color: "var(--zone-low)", help: "How many deadlines fall inside the busiest 3-day window." },
];
const MEANING = {
  low: "Comfortable. You have room to get ahead.",
  medium: "Steady. Keep an eye on the next deadlines.",
  high: "Heavy. Plan carefully and protect study time.",
  critical: "Overloaded. Act on the warnings first.",
};

function Insights() {
  const { workload: w } = useData();
  const pts = PARTS.map((p) => ({ ...p, raw: w.components[p.key], points: w.components[p.key] * SCORE_WEIGHTS[p.key] }));
  const penalty = w.components.overduePenalty;
  const cap = w.totals.capacityHours14d;
  const need = w.totals.remainingHours;
  const ratio = cap > 0 ? need / cap : need > 0 ? 2 : 0;
  return (
    <>
      <PageHeader eyebrow="Understand the number" title="Workload insights" description="What is driving your score, based on your actual tasks and study hours." />
      <div className="stagger grid items-start gap-5 lg:grid-cols-12 *:min-w-0">
        <section aria-label="Workload score" className="panel rounded-lg border border-line-strong p-5 sm:p-7 lg:col-span-7">
          <p className="t-label">Workload score</p>
          <div className="mt-4"><ScoreMeter workload={w} /></div>
          <p className="mt-6 border-t border-line pt-4 text-sm text-panel-ink/80">{MEANING[w.category]}</p>
          <p className="t-small mt-2">A practical indicator based on what you have entered. It is not a validated prediction of academic outcomes.</p>
        </section>

        <Card className="lg:col-span-5">
          <CardHead title="Score anatomy" action={<span className="t-label tnum">= {w.score} / 100</span>} />
          <div className="p-4">
            <div className="flex h-5 w-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]" role="img" aria-label={`Score of ${w.score} made of ${pts.map((p) => `${p.label} ${p.points.toFixed(1)} points`).join(", ")}${penalty ? `, overdue penalty ${penalty} points` : ""}`}>
              {pts.map((p) => <span key={p.key} className="h-full transition-[width] duration-700" style={{ width: `${p.points}%`, background: p.color }} />)}
              {penalty ? <span className="h-full bg-crit transition-[width] duration-700" style={{ width: `${penalty}%` }} /> : null}
            </div>
            <dl className="mt-5 flex flex-col gap-5">
              {pts.map((p) => (
                <div key={p.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-sm">
                  <dt className="flex items-center gap-2 font-medium"><span className="size-2.5" style={{ background: p.color }} aria-hidden />{p.label}</dt>
                  <dd className="tnum font-mono text-[0.8125rem]">{Math.round(SCORE_WEIGHTS[p.key] * 100)}% × {Math.round(p.raw)} = <span className="font-semibold">{p.points.toFixed(1)}</span></dd>
                  <dd className="col-span-2">
                    <div className="bar mt-1.5" style={{ "--z": p.color }}><b style={{ width: `${p.raw}%` }} /></div>
                    <p className="t-small mt-1">{p.help}</p>
                  </dd>
                </div>
              ))}
              {penalty > 0 ? <div className="flex items-baseline justify-between border-t border-line pt-4 text-sm"><dt className="flex items-center gap-2 font-medium"><span className="size-2.5 bg-crit" aria-hidden />Overdue penalty</dt><dd className="tnum font-mono text-[0.8125rem] font-semibold text-crit">+{penalty}</dd></div> : null}
            </dl>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHead title="Why this score" />
          <ul className="divide-y divide-line">
            {w.insights.map((i) => <li key={i.code + i.text} className="flex items-start gap-3 p-3 sm:px-4"><SeverityBadge severity={i.severity} /><p className="min-w-0 flex-1 text-sm">{i.text}</p></li>)}
          </ul>
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <Card>
            <CardHead title="Your capacity" />
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="t-num tnum text-[2.5rem]">{formatHours(need)}</p><p className="t-label mt-2">Preparation left</p></div>
                <div><p className="t-num tnum text-[2.5rem]">{formatHours(cap)}</p><p className="t-label mt-2">Study time, 14 days</p></div>
              </div>
              <Progress value={Math.min(100, ratio * 100)} zone={ratio > 1 ? "critical" : ratio > 0.75 ? "high" : "low"} label="Preparation compared with available study time" className="mt-4" />
              <p className="t-small mt-2">Change your study hours in Settings.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="How to read the score" />
            <ul className="divide-y divide-line">
              {w.thresholds.map((c) => (
                <li key={c.key} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm", c.key === w.category && "bg-surface-2")}>
                  <Badge tone={c.key} className="w-[4.5rem] justify-center">{c.label}</Badge>
                  <span className="tnum w-16 shrink-0 font-mono text-[0.8125rem]">{c.min}–{c.max}</span>
                  <span className="t-small hidden sm:inline">{MEANING[c.key]}</span>
                  {c.key === w.category ? <span className="t-label ml-auto text-ink">You</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="lg:col-span-12">
          <CardHead title="Courses by workload" />
          {w.perCourse.length === 0 ? <p className="t-small p-4">No active tasks.</p> : (
            <ul className="divide-y divide-line">{w.perCourse.map((c) => (
              <li key={String(c.courseId)} className="ledger-row flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56"><CourseTag course={c.course} className="text-sm" /><p className="font-medium break-words">{c.course?.name}</p><p className="t-small">{c.activeTasks} active · {formatHours(c.remainingHours)} to prepare{c.nextDue ? ` · next ${formatDay(toDateKey(c.nextDue))}` : ""}</p></div>
                {c.multipleUpcomingDeadlines ? <Badge tone="warning">Several deadlines soon</Badge> : null}
                <div className="flex w-full items-center gap-3 sm:w-64"><Progress value={c.score} zone={c.category} label={`${c.course?.code ?? "Course"} workload ${c.score}`} className="flex-1" /><span className="t-num tnum w-10 text-right text-[2rem]">{c.score}</span></div>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="dashboard"><Insights /></ReadyGate>; }
