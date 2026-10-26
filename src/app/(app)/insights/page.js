"use client";
import { Badge, Card, PageHeader, SeverityBadge } from "@/components/ui";
import { ReadyGate, ScoreMeter } from "@/components/domain";
import { useData } from "@/lib/store";
import { SCORE_WEIGHTS } from "@/lib/engine/config";
import { formatDay, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

const PARTS = [
  { key: "urgency", label: "Urgency", help: "How much weighted work sits close to now." },
  { key: "squeeze", label: "Time squeeze", help: "Whether preparation fits the study hours available before each deadline." },
  { key: "crunch", label: "Overlap", help: "How many deadlines fall inside the busiest 3-day window." },
];

function Insights() {
  const { workload: w } = useData();
  return (
    <>
      <PageHeader title="Workload insights" description="What is driving your score, based on your actual tasks and study hours." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card className="p-4 sm:p-5"><ScoreMeter workload={w} />
            <p className="t-small mt-4">A practical indicator based on what you have entered. It is not a validated prediction of academic outcomes.</p>
          </Card>
          <Card>
            <h2 className="t-section border-b border-line p-4">Why this score</h2>
            <ul className="divide-y divide-line">
              {w.insights.map((i) => <li key={i.code + i.text} className="flex items-start gap-3 p-3 sm:px-4"><SeverityBadge severity={i.severity} /><p className="min-w-0 flex-1 text-sm">{i.text}</p></li>)}
            </ul>
          </Card>
          <Card>
            <h2 className="t-section border-b border-line p-4">Courses</h2>
            {w.perCourse.length === 0 ? <p className="t-small p-4">No active tasks.</p> : (
              <ul className="divide-y divide-line">{w.perCourse.map((c) => (
                <li key={String(c.courseId)} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 sm:px-4">
                  <div className="min-w-0 flex-1 basis-48"><p className="break-words font-medium">{c.course?.code} {c.course?.name}</p><p className="t-small">{c.activeTasks} active, {formatHours(c.remainingHours)} to prepare{c.nextDue ? `, next ${formatDay(toDateKey(c.nextDue))}` : ""}</p></div>
                  {c.multipleUpcomingDeadlines ? <Badge tone="warning">Several deadlines soon</Badge> : null}
                  <Badge tone={c.category}>{c.score}</Badge>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card className="p-4">
            <h2 className="t-section">Score breakdown</h2>
            <dl className="mt-3 flex flex-col gap-4">
              {PARTS.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-sm"><dt className="font-medium">{p.label} <span className="t-small">({Math.round(SCORE_WEIGHTS[p.key] * 100)}%)</span></dt><dd className="tnum">{Math.round(w.components[p.key])}</dd></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-surface-2 ring-1 ring-line"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${w.components[p.key]}%` }} /></div>
                  <p className="t-small mt-1">{p.help}</p>
                </div>
              ))}
              {w.components.overduePenalty > 0 ? <div className="flex justify-between text-sm"><dt className="font-medium">Overdue penalty</dt><dd className="tnum text-crit">+{w.components.overduePenalty}</dd></div> : null}
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="t-section">Your capacity</h2>
            <p className="tnum mt-2 text-sm">{formatHours(w.totals.remainingHours)} of preparation remaining</p>
            <p className="tnum text-sm">{formatHours(w.totals.capacityHours14d)} of study time in the next 14 days</p>
            <p className="t-small mt-2">Change your study hours in Settings.</p>
          </Card>
          <Card className="p-4">
            <h2 className="t-section">Categories</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">{w.thresholds.map((c) => <li key={c.key} className="flex items-center justify-between"><Badge tone={c.key}>{c.label}</Badge><span className="tnum">{c.min} to {c.max}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate><Insights /></ReadyGate>; }
