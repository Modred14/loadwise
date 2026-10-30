"use client";
import { useMemo, useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardList, Printer, RefreshCw, SkipForward, Undo2 } from "lucide-react";
import { Badge, Banner, Button, Card, Dialog, EmptyState, IconButton, PageHeader, Progress, cx, useToast } from "@/components/ui";
import { CourseTag, ReadyGate, useCourseColor } from "@/components/domain";
import { useData } from "@/lib/store";
import { buildIcs, icsFilename } from "@/lib/ics";
import { downloadText } from "@/lib/download";
import { addDays, toDateKey } from "@/lib/engine";
import { formatClock, formatDay, formatDayLong, formatHours } from "@/lib/format";

const monday = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const minutesOf = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const DOW = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const ROW = 56; // px per hour in the week grid
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

/** One session as a list row: used for the phone agenda and the printed plan. */
function SessionRow({ s, title, course, onMark, busy, print }) {
  const colorOf = useCourseColor();
  const muted = s.status !== "planned";
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:px-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="course-mark mt-0.5 h-10 w-1 shrink-0" style={{ "--c": colorOf(s.courseId) }} aria-hidden />
        <span className="tnum w-[6.25rem] shrink-0 pt-0.5 font-mono text-[0.8125rem]">{formatClock(s.startsAt)}–{formatClock(s.endsAt)}</span>
        <div className="min-w-0 flex-1">
          <p className={cx("font-medium break-words", muted && "text-muted", s.status === "completed" && "line-through")}>{title ?? "Study session"}</p>
          <p className="t-small flex flex-wrap items-center gap-x-2">{course ? <CourseTag course={course} /> : null}<span>{s.minutes} min</span>{s.status === "skipped" ? <Badge>Skipped</Badge> : s.status === "completed" ? <Badge tone="low">Done</Badge> : null}</p>
          {s.reason ? (
            print ? <p className="t-small mt-1">{s.reason}</p> : <details className="mt-1 text-sm"><summary className="inline-flex min-h-8 items-center text-primary underline underline-offset-4">Why this session</summary><p className="t-small mt-1">{s.reason}</p></details>
          ) : null}
        </div>
      </div>
      {!print ? <SessionActions s={s} busy={busy} onMark={onMark} /> : null}
    </li>
  );
}

function SessionActions({ s, busy, onMark }) {
  return (
    <div className="flex gap-2">
      {s.status === "planned" ? (
        <>
          <Button variant="secondary" icon={Check} loading={busy === s.id} onClick={() => onMark(s, "completed")}>Done</Button>
          <Button variant="ghost" icon={SkipForward} disabled={busy === s.id} onClick={() => onMark(s, "skipped")}>Skip</Button>
        </>
      ) : <Button variant="ghost" icon={Undo2} loading={busy === s.id} onClick={() => onMark(s, "planned")}>Undo</Button>}
    </div>
  );
}

/** Desktop: seven day-columns on a shared hour axis. Block height = duration. */
function WeekGrid({ days, byDay, now, taskOf, onOpen }) {
  const colorOf = useCourseColor();
  const all = days.flatMap((k) => byDay.get(k) ?? []);
  const startH = Math.max(0, Math.floor(Math.min(...all.map((s) => minutesOf(s.startsAt))) / 60));
  const endH = Math.min(24, Math.max(startH + 6, Math.ceil(Math.max(...all.map((s) => minutesOf(s.endsAt))) / 60)));
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const todayKey = toDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const y = (min) => ((min - startH * 60) / 60) * ROW;
  return (
    <Card className="hidden overflow-hidden lg:block print:hidden">
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-line-strong bg-surface-2">
        <div />
        {days.map((k) => {
          const list = (byDay.get(k) ?? []).filter((s) => s.status !== "skipped");
          const mins = list.reduce((a, s) => a + s.minutes, 0);
          const today = k === todayKey;
          return (
            <div key={k} className={cx("border-l border-line px-2.5 py-2", today && "bg-primary-soft")}>
              <p className={cx("t-label", today && "text-primary")}>{DOW.format(parseKey(k))}</p>
              <p className="flex items-baseline justify-between"><span className={cx("font-display text-2xl leading-none", today && "text-primary")}>{parseKey(k).getDate()}</span><span className="tnum font-mono text-[0.6875rem] text-muted">{mins ? formatHours(mins / 60) : ""}</span></p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]" style={{ height: (endH - startH) * ROW + 1 }}>
        <div className="relative">
          {hours.map((h) => <span key={h} className="tnum absolute right-2 -translate-y-1/2 font-mono text-[0.625rem] text-muted first:translate-y-0" style={{ top: (h - startH) * ROW }}>{String(h).padStart(2, "0")}:00</span>)}
        </div>
        {days.map((k) => {
          const today = k === todayKey;
          return (
            <div key={k} role="list" aria-label={formatDayLong(k)} className={cx("relative border-l border-line", today && "bg-primary-soft/40")}>
              {hours.map((h) => <span key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: (h - startH) * ROW }} aria-hidden />)}
              {today && nowMin >= startH * 60 && nowMin <= endH * 60 ? <span className="absolute inset-x-0 z-10 flex items-center" style={{ top: y(nowMin) }} aria-hidden><span className="-ml-1 size-2 bg-crit" /><span className="h-px flex-1 bg-crit" /></span> : null}
              {(byDay.get(k) ?? []).map((s) => {
                const top = y(minutesOf(s.startsAt));
                const h = Math.max((s.minutes / 60) * ROW - 3, 22);
                const t = taskOf(s.taskId);
                return (
                  <button key={s.id} role="listitem" type="button" onClick={() => onOpen(s)}
                    aria-label={`${t?.title ?? "Study session"}, ${formatClock(s.startsAt)} to ${formatClock(s.endsAt)}, ${s.status}`}
                    className={cx("absolute inset-x-1 overflow-hidden rounded-sm border-l-[3px] px-1.5 py-1 text-left transition-[transform,box-shadow] hover:z-20 hover:-translate-y-px hover:shadow-lift focus-visible:z-20", s.status === "skipped" && "border-dashed opacity-60")}
                    style={{ top: top + 1, height: h, borderLeftColor: colorOf(s.courseId), background: `color-mix(in srgb, ${colorOf(s.courseId)} ${s.status === "completed" ? 8 : 16}%, var(--surface))` }}>
                    <span className={cx("flex items-start gap-1 text-xs leading-tight font-medium", s.status !== "planned" && "text-muted", s.status === "completed" && "line-through")}>
                      {s.status === "completed" ? <Check size={12} className="mt-px shrink-0 text-ok" aria-hidden /> : null}<span className="line-clamp-2">{t?.title ?? "Study session"}</span>
                    </span>
                    {h >= 40 ? <span className="tnum mt-0.5 block font-mono text-[0.625rem] text-muted">{formatClock(s.startsAt)}–{formatClock(s.endsAt)}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Planner() {
  const { sessions, tasks, courses, plan, now, savePlan, setSessionStatus } = useData();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => monday(now));
  const [sel, setSel] = useState(() => toDateKey(now));
  const [detail, setDetail] = useState(null);
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
  const selected = days.includes(sel) ? sel : days[0];

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
      toast(plan.feasible ? "Study plan saved" : "Plan saved with conflicts", plan.feasible ? "success" : "info");
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const mark = async (s, status) => {
    setBusy(s.id); setErr(null);
    try {
      await setSessionStatus(s.id, status);
      toast(status === "completed" ? "Session marked done" : status === "skipped" ? "Session skipped" : "Session restored");
      setDetail(null);
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const weekSessions = days.flatMap((k) => byDay.get(k) ?? []).filter((s) => s.status !== "skipped");
  const doneMin = weekSessions.filter((s) => s.status === "completed").reduce((a, s) => a + s.minutes, 0);
  const totalMin = weekSessions.reduce((a, s) => a + s.minutes, 0);
  const todayKey = toDateKey(now);
  const peak = Math.max(60, ...days.map((k) => (byDay.get(k) ?? []).filter((s) => s.status !== "skipped").reduce((a, s) => a + s.minutes, 0)));
  const weekLabel = `${formatDay(days[0])} – ${formatDay(days[6])}`;
  const live = detail ? sessions.find((s) => s.id === detail.id) ?? detail : null; // reflect status changes while open

  return (
    <>
      <div className="hidden print:block">
        <h1 className="t-page">LoadWise study plan</h1>
        <p className="t-small mb-4">Week of {formatDayLong(toDateKey(weekStart))}. Printed {formatDayLong(todayKey)}.</p>
      </div>
      <div className="print:hidden">
        <PageHeader eyebrow="Plan" title="Study planner" description="Sessions are scheduled before each deadline, inside the hours you set in Settings. Completed sessions are always kept."
          actions={<>
            {sessions.length ? <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / Save as PDF</Button> : null}
            {savedOpen.length ? <Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>Add to calendar (.ics)</Button> : null}
            <Button icon={sessions.length ? RefreshCw : ClipboardList} loading={busy === "gen"} disabled={!plan || !hasOpenTasks || plan.sessions.length === 0} onClick={generate}>{savedOpen.length ? "Regenerate plan" : "Generate plan"}</Button>
          </>} />
        <div className="flex flex-col gap-3 empty:hidden">
          {err ? <Banner title="Could not update the plan">{err}</Banner> : null}
          {saved ? <Banner tone={plan?.feasible ? "low" : "warning"}>{saved}</Banner> : null}
          {stale && savedOpen.length > 0 ? <Banner tone="info" title="Your saved plan is out of date">Deadlines, estimates or progress changed since it was generated. Regenerate to update it.</Banner> : null}
          {plan?.conflicts.length ? (
            <Banner tone="critical" title="Not everything fits in your available time">
              <ul className="mt-1 list-disc pl-5">{plan.conflicts.map((c) => <li key={c.taskId}><span className="font-medium">{c.title}</span>: about {formatHours(c.missingMinutes / 60)} cannot be scheduled. {c.reason}</li>)}</ul>
              <p className="mt-1">The plan protects your most urgent and important work first. Add study hours in Settings or reduce what you take on.</p>
            </Banner>
          ) : null}
        </div>
      </div>

      {!hasOpenTasks ? (
        <Card className="mt-4"><EmptyState icon={ClipboardList} title="Nothing to plan">Add tasks with due dates and a plan will be built for you.</EmptyState></Card>
      ) : sessions.length === 0 ? (
        <Card className="mt-4"><EmptyState icon={ClipboardList} title="No study plan yet" action={<Button loading={busy === "gen"} disabled={!plan || plan.sessions.length === 0} onClick={generate}>Generate my plan</Button>}>
          {plan?.sessions.length ? `A plan of ${formatHours(plan.summary.plannedMinutes / 60)} across ${new Set(plan.sessions.map((s) => s.date)).size} days is ready to save.` : "No sessions can be scheduled with your current tasks and hours."}
        </EmptyState></Card>
      ) : (
        <>
          <div className="my-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
            <div className="flex flex-wrap items-center gap-1">
              <IconButton label="Previous week" icon={ChevronLeft} className="border border-line-strong bg-surface" onClick={() => setWeekStart((w) => addDays(w, -7))} />
              <Button variant="secondary" onClick={() => { setWeekStart(monday(now)); setSel(todayKey); }}>This week</Button>
              <IconButton label="Next week" icon={ChevronRight} className="border border-line-strong bg-surface" onClick={() => setWeekStart((w) => addDays(w, 7))} />
              <p className="tnum order-last w-full font-display text-2xl sm:order-none sm:ml-3 sm:w-auto">{weekLabel}</p>
            </div>
            <div className="w-full sm:w-64">
              <p className="tnum t-small flex justify-between"><span>This week</span><span>{formatHours(doneMin / 60)} of {formatHours(totalMin / 60)} done</span></p>
              <Progress value={totalMin ? (doneMin / totalMin) * 100 : 0} label="Study completed this week" className="mt-1.5" />
            </div>
          </div>

          {totalMin === 0 && weekSessions.length === 0 ? <Card className="print:hidden"><EmptyState icon={ClipboardList} title="No sessions this week">Use the arrows to find your planned weeks.</EmptyState></Card> : (
            <>
              <WeekGrid days={days} byDay={byDay} now={now} taskOf={taskOf} onOpen={setDetail} />

              {/* Phones and tablets: day strip + agenda */}
              <div className="lg:hidden print:hidden">
                <div role="group" aria-label="Choose a day" className="grid grid-cols-7 gap-1">
                  {days.map((k) => {
                    const mins = (byDay.get(k) ?? []).filter((s) => s.status !== "skipped").reduce((a, s) => a + s.minutes, 0);
                    const on = k === selected;
                    return (
                      <button key={k} type="button" aria-pressed={on} onClick={() => setSel(k)} aria-label={`${formatDayLong(k)}, ${mins ? formatHours(mins / 60) + " planned" : "no sessions"}`}
                        className={cx("flex min-h-[4.5rem] flex-col items-center justify-between rounded-md border py-2 transition-colors", on ? "border-ink bg-ink text-white" : k === todayKey ? "border-primary bg-primary-soft" : "border-line bg-surface")}>
                        <span className={cx("t-label", on && "text-white/70")}>{DOW.format(parseKey(k)).slice(0, 3)}</span>
                        <span className="font-display text-xl leading-none">{parseKey(k).getDate()}</span>
                        <span className="flex h-3 items-end" aria-hidden><span className={cx("block w-3", on ? "bg-white" : "bg-line-strong")} style={{ height: mins ? Math.max(2, (mins / peak) * 12) : 0 }} /></span>
                      </button>
                    );
                  })}
                </div>
                <Card className="mt-3">
                  <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">{formatDayLong(selected)}{selected === todayKey ? <Badge tone="info">Today</Badge> : null}</h2>
                  {(byDay.get(selected) ?? []).length === 0 ? <p className="t-small px-4 py-5">No sessions this day.</p> : (
                    <ul className="divide-y divide-line">{(byDay.get(selected) ?? []).map((s) => <SessionRow key={s.id} s={s} title={taskOf(s.taskId)?.title} course={courseOf(s.courseId)} busy={busy} onMark={mark} />)}</ul>
                  )}
                </Card>
              </div>

              {/* Print: the whole week as a plain list */}
              <div className="hidden print:block">
                {days.map((k) => (
                  <section key={k} className="mb-3 break-inside-avoid">
                    <h2 className="border-b border-line py-1 text-sm font-semibold">{formatDayLong(k)}</h2>
                    {(byDay.get(k) ?? []).length === 0 ? <p className="t-small py-1">No sessions.</p> : <ul>{(byDay.get(k) ?? []).map((s) => <SessionRow key={s.id} s={s} print title={taskOf(s.taskId)?.title} course={courseOf(s.courseId)} />)}</ul>}
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={!!live} onClose={() => setDetail(null)} title={live ? (taskOf(live.taskId)?.title ?? "Study session") : ""}
        footer={live ? <SessionActions s={live} busy={busy} onMark={mark} /> : null}>
        {live ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
            <dt className="t-label pt-0.5">Course</dt><dd>{courseOf(live.courseId) ? <CourseTag course={courseOf(live.courseId)} className="text-sm" /> : "None"}{courseOf(live.courseId)?.name ? <span className="t-small"> · {courseOf(live.courseId).name}</span> : null}</dd>
            <dt className="t-label pt-0.5">When</dt><dd className="tnum">{formatDayLong(live.date)}, {formatClock(live.startsAt)}–{formatClock(live.endsAt)} <span className="text-muted">({live.minutes} min)</span></dd>
            <dt className="t-label pt-0.5">Status</dt><dd>{live.status === "completed" ? <Badge tone="low">Done</Badge> : live.status === "skipped" ? <Badge>Skipped</Badge> : <Badge tone="info">Planned</Badge>}</dd>
            {live.reason ? <><dt className="t-label pt-0.5">Why</dt><dd>{live.reason}</dd></> : null}
          </dl>
        ) : null}
      </Dialog>
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="list"><Planner /></ReadyGate>; }
