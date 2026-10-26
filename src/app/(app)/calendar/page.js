"use client";
import { useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Banner, Button, Card, PageHeader } from "@/components/ui";
import { buildIcs, icsFilename } from "@/lib/ics";
import { downloadText } from "@/lib/download";
import { ReadyGate, TaskMeta } from "@/components/domain";
import { useData } from "@/lib/store";
import { addDays, toDateKey } from "@/lib/engine";
import { formatClock, formatDayLong, formatMonth } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Calendar() {
  const { tasks, courses, sessions, now } = useData();
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

  const dayTasks = (byDay.get(selected) ?? []).sort((a, b) => (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59"));
  const daySessions = (sessionsByDay.get(selected) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = tasks.filter((t) => t.status !== "completed" && t.dueDate >= todayKey).sort((a, b) => `${a.dueDate}${a.dueTime ?? "23:59"}`.localeCompare(`${b.dueDate}${b.dueTime ?? "23:59"}`)).slice(0, 8);

  return (
    <>
      <PageHeader title="Calendar" description="Deadlines by day. Select a day to see its tasks and study sessions." actions={<Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>Add to calendar (.ics)</Button>} />
      {exported ? <div className="mb-4"><Banner tone="info">{exported}</Banner></div> : null}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-2 sm:p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="t-section" aria-live="polite">{formatMonth(month)}</h2>
              <div className="flex gap-1">
                <Button variant="secondary" aria-label="Previous month" onClick={() => shift(-1)} className="!px-3"><ChevronLeft size={16} aria-hidden /></Button>
                <Button variant="secondary" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayKey); }}>Today</Button>
                <Button variant="secondary" aria-label="Next month" onClick={() => shift(1)} className="!px-3"><ChevronRight size={16} aria-hidden /></Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-px text-center" role="group" aria-label={formatMonth(month)}>
              {WEEKDAYS.map((w) => <div key={w} className="t-label py-1.5 text-[10px] sm:text-xs">{w}</div>)}
              {cells.map((d) => {
                const key = toDateKey(d);
                const inMonth = d.getMonth() === month.getMonth();
                const ts = byDay.get(key) ?? [];
                const open = ts.filter((t) => t.status !== "completed");
                const hasOverdue = open.length > 0 && key < todayKey;
                const hasMajor = open.some((t) => t.type === "exam" || t.type === "test");
                const isSel = key === selected;
                return (
                  <button key={key} type="button" aria-pressed={isSel} aria-current={key === todayKey ? "date" : undefined}
                    aria-label={`${formatDayLong(key)}, ${ts.length} deadline${ts.length === 1 ? "" : "s"}`} onClick={() => setSelected(key)}
                    className={`flex min-h-12 min-w-0 flex-col items-center justify-start gap-1 rounded-md border p-1 text-sm transition-colors sm:min-h-20 sm:items-start sm:p-1.5 ${isSel ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface-2"} ${inMonth ? "" : "text-muted/60"}`}>
                    <span className={`tnum flex size-6 items-center justify-center rounded-full text-xs sm:text-sm ${key === todayKey ? "bg-primary text-white" : ""}`}>{d.getDate()}</span>
                    {ts.length > 0 ? (
                      <span className="flex items-center gap-0.5">
                        <span className={`size-2 rounded-full ${hasOverdue ? "bg-crit" : hasMajor ? "bg-warn" : "bg-primary"} ${open.length === 0 ? "opacity-40" : ""}`} aria-hidden />
                        <span className="tnum text-[11px] text-muted">{ts.length}</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="t-small mt-3 flex flex-wrap gap-x-4 gap-y-1"><span><span className="mr-1 inline-block size-2 rounded-full bg-warn" />Exam or test</span><span><span className="mr-1 inline-block size-2 rounded-full bg-primary" />Other deadline</span><span><span className="mr-1 inline-block size-2 rounded-full bg-crit" />Overdue</span></p>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="t-section border-b border-line p-4">{formatDayLong(selected)}</h2>
            {dayTasks.length === 0 && daySessions.length === 0 ? <p className="t-small p-4">Nothing on this day.</p> : (
              <ul className="divide-y divide-line">
                {dayTasks.map((t) => <li key={t.id} className="p-3 sm:px-4"><p className="break-words font-medium">{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></li>)}
                {daySessions.map((s) => <li key={s.id} className="p-3 sm:px-4"><p className="font-medium"><Badge tone="info">Study</Badge> <span className="tnum">{formatClock(s.startsAt)}-{formatClock(s.endsAt)}</span></p><p className="t-small mt-0.5 break-words">{taskOf(s.taskId)?.title}</p></li>)}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="t-section border-b border-line p-4">Next deadlines</h2>
            {upcoming.length === 0 ? <p className="t-small p-4">No upcoming deadlines.</p> : (
              <ul className="divide-y divide-line">{upcoming.map((t) => <li key={t.id} className="p-3 sm:px-4"><button type="button" className="w-full text-left" onClick={() => { setSelected(t.dueDate); setMonth(new Date(+t.dueDate.slice(0, 4), +t.dueDate.slice(5, 7) - 1, 1)); }}><p className="break-words font-medium">{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></button></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate><Calendar /></ReadyGate>; }
