"use client";
import { useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Banner, Button, Card, CardHead, IconButton, PageHeader, cx } from "@/components/ui";
import { buildIcs, icsFilename } from "@/lib/ics";
import { downloadText } from "@/lib/download";
import { ReadyGate, TaskMeta, useCourseColor } from "@/components/domain";
import { useData } from "@/lib/store";
import { addDays, toDateKey } from "@/lib/engine";
import { formatClock, formatDayLong, formatHours, formatMonth } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Deadline colour: overdue, exam/test, other. Completed items fade. */
const tone = (t, todayKey) => (t.status === "completed" ? "bg-line-strong" : t.dueDate < todayKey ? "bg-crit" : t.type === "exam" || t.type === "test" ? "bg-[var(--zone-high)]" : "bg-[var(--zone-low)]");

function Calendar() {
  const { tasks, courses, sessions, now } = useData();
  const colorOf = useCourseColor();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(toDateKey(now));
  const [exported, setExported] = useState(null);
  const todayKey = toDateKey(now);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const t of tasks) m.set(t.dueDate, [...(m.get(t.dueDate) ?? []), t]);
    return m;
  }, [tasks]);
  const sessionsByDay = useMemo(() => {
    const m = new Map();
    for (const s of sessions) if (s.status !== "skipped") m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const courseOf = (id) => courses.find((c) => c.id === id);
  const taskOf = (id) => tasks.find((t) => t.id === id);
  const exportIcs = () => {
    const { text, count } = buildIcs({ tasks, courses, now, studySessions: false });
    if (count === 0) { setExported("There are no open deadlines to export."); return; }
    downloadText(icsFilename(now, "deadlines"), "text/calendar", text);
    setExported(`Downloaded ${count} deadline${count === 1 ? "" : "s"} with reminders. Open the file to add them to your calendar app.`);
  };
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const dayTasks = [...(byDay.get(selected) ?? [])].sort((a, b) => (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59"));
  const daySessions = [...(sessionsByDay.get(selected) ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = tasks.filter((t) => t.status !== "completed" && t.dueDate >= todayKey).sort((a, b) => `${a.dueDate}${a.dueTime ?? "23:59"}`.localeCompare(`${b.dueDate}${b.dueTime ?? "23:59"}`)).slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Deadlines" title="Calendar" description="Deadlines by day. Select a day to see its tasks and study sessions." actions={<Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>Add to calendar (.ics)</Button>} />
      {exported ? <div className="mb-4"><Banner tone="info">{exported}</Banner></div> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
            <h2 className="font-display text-[1.75rem] leading-none" aria-live="polite">{formatMonth(month)}</h2>
            <div className="flex items-center gap-1">
              <IconButton label="Previous month" icon={ChevronLeft} className="border border-line-strong" onClick={() => shift(-1)} />
              <Button variant="secondary" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayKey); }}>Today</Button>
              <IconButton label="Next month" icon={ChevronRight} className="border border-line-strong" onClick={() => shift(1)} />
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-line bg-surface-2" aria-hidden>
            {WEEKDAYS.map((w) => <div key={w} className="t-label py-2 text-center text-[0.625rem] sm:text-[0.6875rem]">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-line" role="group" aria-label={formatMonth(month)}>
            {cells.map((d) => {
              const key = toDateKey(d);
              const inMonth = d.getMonth() === month.getMonth();
              const ts = byDay.get(key) ?? [];
              const ordered = [...ts].sort((a, b) => (a.status === "completed") - (b.status === "completed") || (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59"));
              const isSel = key === selected;
              const isToday = key === todayKey;
              const studyMin = (sessionsByDay.get(key) ?? []).reduce((a, s) => a + s.minutes, 0);
              return (
                <button key={key} type="button" aria-pressed={isSel} aria-current={isToday ? "date" : undefined}
                  aria-label={`${formatDayLong(key)}, ${ts.length} deadline${ts.length === 1 ? "" : "s"}${studyMin ? `, ${formatHours(studyMin / 60)} study planned` : ""}`} onClick={() => setSelected(key)}
                  className={cx("relative flex min-h-[3.75rem] min-w-0 flex-col items-stretch gap-1 p-1 text-left transition-colors sm:min-h-[6.5rem] sm:p-1.5", inMonth ? "bg-surface hover:bg-primary-soft/60" : "bg-surface-2 text-muted hover:bg-primary-soft/40", isSel && "z-10 outline-2 -outline-offset-2 outline-ink")}>
                  <span className={cx("tnum flex size-6 items-center justify-center self-start text-xs sm:text-sm", isToday ? "bg-ink font-semibold text-white" : "")}>{d.getDate()}</span>
                  {/* phones: compact markers */}
                  <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                    {ordered.slice(0, 4).map((t) => <span key={t.id} className={cx("block h-1.5 w-3", tone(t, todayKey))} />)}
                    {ordered.length > 4 ? <span className="font-mono text-[0.625rem] leading-none text-muted">+</span> : null}
                  </span>
                  {/* tablets and up: real deadline chips */}
                  <span className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex" aria-hidden>
                    {ordered.slice(0, 2).map((t) => (
                      <span key={t.id} className="flex min-w-0 items-center gap-1 rounded-xs bg-bg/80 py-px pr-1 text-[0.6875rem] leading-4">
                        <span className={cx("block h-4 w-[3px] shrink-0", tone(t, todayKey))} />
                        <span className={cx("truncate", t.status === "completed" && "text-muted line-through")}>{t.title}</span>
                      </span>
                    ))}
                    {ordered.length > 2 ? <span className="pl-1 font-mono text-[0.625rem] text-muted">+{ordered.length - 2} more</span> : null}
                  </span>
                  {studyMin ? <span className="tnum mt-auto hidden items-center gap-1 font-mono text-[0.625rem] text-muted sm:flex" aria-hidden><span className="block h-2 w-0.5 bg-line-strong" />{formatHours(studyMin / 60)}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="t-small flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5"><span className="block h-2 w-3 bg-[var(--zone-high)]" aria-hidden />Exam or test</span>
            <span className="inline-flex items-center gap-1.5"><span className="block h-2 w-3 bg-[var(--zone-low)]" aria-hidden />Other deadline</span>
            <span className="inline-flex items-center gap-1.5"><span className="block h-2 w-3 bg-crit" aria-hidden />Overdue</span>
            <span className="inline-flex items-center gap-1.5"><span className="block h-2 w-3 bg-line-strong" aria-hidden />Completed</span>
          </p>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="border-b border-line px-4 py-3"><p className="t-label">Selected day</p><h2 className="font-display text-[1.5rem] leading-tight">{formatDayLong(selected)}</h2></div>
            {dayTasks.length === 0 && daySessions.length === 0 ? <p className="t-small p-4">Nothing on this day.</p> : (
              <ul className="divide-y divide-line">
                {dayTasks.map((t) => <li key={t.id} className="flex gap-3 p-3 sm:px-4"><span className={cx("mt-1 h-8 w-1 shrink-0", tone(t, todayKey))} aria-hidden /><div className="min-w-0"><p className={cx("font-medium break-words", t.status === "completed" && "text-muted line-through")}>{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></div></li>)}
                {daySessions.map((s) => (
                  <li key={s.id} className="flex gap-3 p-3 sm:px-4">
                    <span className="course-mark mt-1 h-8 w-1 shrink-0" style={{ "--c": colorOf(s.courseId) }} aria-hidden />
                    <div className="min-w-0"><p className="t-label">Study session</p><p className="tnum font-mono text-[0.8125rem] font-medium">{formatClock(s.startsAt)}–{formatClock(s.endsAt)}</p><p className="t-small mt-0.5 break-words">{taskOf(s.taskId)?.title}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHead title="Next deadlines" />
            {upcoming.length === 0 ? <p className="t-small p-4">No upcoming deadlines.</p> : (
              <ul className="divide-y divide-line">{upcoming.map((t) => <li key={t.id}><button type="button" className="ledger-row w-full px-4 py-3 text-left" onClick={() => { setSelected(t.dueDate); setMonth(new Date(+t.dueDate.slice(0, 4), +t.dueDate.slice(5, 7) - 1, 1)); }}><p className="font-medium break-words">{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></button></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate><Calendar /></ReadyGate>; }
