"use client";
import { useMemo, useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardList, Printer, RefreshCw, SkipForward, Undo2 } from "lucide-react";
import { Badge, Banner, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { ReadyGate } from "@/components/domain";
import { useData } from "@/lib/store";
import { buildIcs, icsFilename } from "@/lib/ics";
import { downloadText } from "@/lib/download";
import { addDays, toDateKey } from "@/lib/engine";
import { formatClock, formatDayLong, formatHours } from "@/lib/format";

const monday = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));

function Planner() {
  const { sessions, tasks, courses, plan, now, savePlan, setSessionStatus } = useData();
  const [weekStart, setWeekStart] = useState(() => monday(now));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null);
  const taskOf = (id) => tasks.find((t) => t.id === id);
  const courseOf = (id) => courses.find((c) => c.id === id);
  const hasOpenTasks = tasks.some((t) => t.status !== "completed");

  const savedOpen = sessions.filter((s) => s.status === "planned");
  const sig = (list) => list.map((s) => `${s.taskId}|${s.startsAt}|${s.minutes}`).sort().join(";");
  const stale = plan && sig(plan.sessions) !== sig(savedOpen);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i))), [weekStart]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    for (const [, v] of m) v.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return m;
  }, [sessions]);

  const exportIcs = () => {
    const { text, count } = buildIcs({ tasks, sessions, courses, now, deadlines: false });
    if (count === 0) { setSaved("There are no planned sessions to export."); return; }
    downloadText(icsFilename(now, "study-plan"), "text/calendar", text);
    setSaved(`Downloaded ${count} study session${count === 1 ? "" : "s"} with 10-minute reminders.`);
  };
  const generate = async () => {
    setBusy("gen"); setErr(null); setSaved(null);
    try {
      await savePlan(plan.sessions);
      setSaved(plan.feasible ? "Plan saved." : "Plan saved, but not everything fits. See the conflicts below.");
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const mark = async (s, status) => {
    setBusy(s.id); setErr(null);
    try { await setSessionStatus(s.id, status); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const weekMinutes = days.flatMap((k) => byDay.get(k) ?? []).filter((s) => s.status !== "skipped");
  const doneMin = weekMinutes.filter((s) => s.status === "completed").reduce((a, s) => a + s.minutes, 0);

  return (
    <>
      <div className="hidden print:block">
        <h1 className="t-page">LoadWise study plan</h1>
        <p className="t-small mb-4">Week of {formatDayLong(toDateKey(weekStart))}. Printed {formatDayLong(toDateKey(now))}.</p>
      </div>
      <div className="print:hidden">
      <PageHeader title="Study planner" description="Sessions are scheduled before each deadline, inside the hours you set in Settings. Completed sessions are always kept."
        actions={<>
          {sessions.length ? <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / Save as PDF</Button> : null}
          {savedOpen.length ? <Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>Add to calendar (.ics)</Button> : null}
          <Button icon={sessions.length ? RefreshCw : ClipboardList} loading={busy === "gen"} disabled={!plan || !hasOpenTasks || plan.sessions.length === 0} onClick={generate}>{savedOpen.length ? "Regenerate plan" : "Generate plan"}</Button>
        </>} />
      {err ? <div className="mb-4"><Banner title="Could not update the plan">{err}</Banner></div> : null}
      {saved ? <div className="mb-4"><Banner tone={plan?.feasible ? "low" : "warning"}>{saved}</Banner></div> : null}
      {stale && savedOpen.length > 0 ? <div className="mb-4"><Banner tone="info" title="Your saved plan is out of date">Deadlines, estimates or progress changed since it was generated. Regenerate to update it.</Banner></div> : null}
      {plan?.conflicts.length ? (
        <div className="mb-4"><Banner tone="critical" title="Not everything fits in your available time">
          <ul className="mt-1 list-disc pl-5">{plan.conflicts.map((c) => <li key={c.taskId}><span className="font-medium">{c.title}</span>: about {formatHours(c.missingMinutes / 60)} cannot be scheduled. {c.reason}</li>)}</ul>
          <p className="mt-1">The plan protects your most urgent and important work first. Add study hours in Settings or reduce what you take on.</p>
        </Banner></div>
      ) : null}
      </div>

      {!hasOpenTasks ? (
        <Card><EmptyState icon={ClipboardList} title="Nothing to plan">Add tasks with due dates and a plan will be built for you.</EmptyState></Card>
      ) : sessions.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="No study plan yet" action={<Button loading={busy === "gen"} disabled={!plan || plan.sessions.length === 0} onClick={generate}>Generate my plan</Button>}>
          {plan?.sessions.length ? `A plan of ${formatHours(plan.summary.plannedMinutes / 60)} across ${new Set(plan.sessions.map((s) => s.date)).size} days is ready to save.` : "No sessions can be scheduled with your current tasks and hours."}
        </EmptyState></Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 print:hidden">
              <Button variant="secondary" aria-label="Previous week" className="!px-3" onClick={() => setWeekStart((w) => addDays(w, -7))}><ChevronLeft size={16} aria-hidden /></Button>
              <Button variant="secondary" onClick={() => setWeekStart(monday(now))}>This week</Button>
              <Button variant="secondary" aria-label="Next week" className="!px-3" onClick={() => setWeekStart((w) => addDays(w, 7))}><ChevronRight size={16} aria-hidden /></Button>
            </div>
            <p className="t-small tnum">{formatHours(doneMin / 60)} of {formatHours(weekMinutes.reduce((a, s) => a + s.minutes, 0) / 60)} done this week</p>
          </div>
          <div className="flex flex-col gap-3">
            {days.map((key) => {
              const list = byDay.get(key) ?? [];
              return (
                <Card key={key}>
                  <h2 className={`flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold ${key === toDateKey(now) ? "text-primary" : ""}`}>{formatDayLong(key)}{key === toDateKey(now) ? <Badge tone="info">Today</Badge> : null}</h2>
                  {list.length === 0 ? <p className="t-small px-4 py-3">No sessions.</p> : (
                    <ul className="divide-y divide-line">
                      {list.map((s) => {
                        const t = taskOf(s.taskId);
                        return (
                          <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:px-4">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span className="tnum w-24 shrink-0 pt-0.5 text-sm">{formatClock(s.startsAt)}-{formatClock(s.endsAt)}</span>
                              <div className="min-w-0 flex-1">
                                <p className={`break-words font-medium ${s.status !== "planned" ? "text-muted" : ""} ${s.status === "completed" ? "line-through" : ""}`}>{t?.title ?? "Study session"}</p>
                                <p className="t-small">{courseOf(s.courseId)?.code} {s.minutes} min {s.status === "skipped" ? "Skipped" : ""}</p>
                                {s.reason ? <><details className="mt-1 text-sm print:hidden"><summary className="cursor-pointer text-primary">Why this session</summary><p className="t-small mt-1">{s.reason}</p></details><p className="t-small mt-1 hidden print:block">{s.reason}</p></> : null}
                              </div>
                            </div>
                            <div className="flex gap-2 print:hidden">
                              {s.status === "planned" ? (<>
                                <Button variant="secondary" icon={Check} loading={busy === s.id} onClick={() => mark(s, "completed")}>Done</Button>
                                <Button variant="ghost" icon={SkipForward} disabled={busy === s.id} onClick={() => mark(s, "skipped")}>Skip</Button>
                              </>) : <Button variant="ghost" icon={Undo2} loading={busy === s.id} onClick={() => mark(s, "planned")}>Undo</Button>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
export default function Page() { return <ReadyGate><Planner /></ReadyGate>; }
