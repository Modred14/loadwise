"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, CalendarCheck, CheckSquare, SlidersHorizontal } from "lucide-react";
import { Banner, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { ReadyGate, ScoreMeter, TaskDialog, TaskMeta, WarningItem, CourseDialog } from "@/components/domain";
import { useData } from "@/lib/store";
import { formatClock, formatDay, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

function Dashboard() {
  const d = useData();
  const [taskOpen, setTaskOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const { workload, tasks, courses, sessions, now, warningsShown } = d;
  const active = tasks.filter((t) => t.status !== "completed");
  const todayKey = toDateKey(now);
  const todays = sessions.filter((s) => s.date === todayKey && s.status !== "skipped").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const weekEnd = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  const week = sessions.filter((s) => s.date >= todayKey && s.date <= weekEnd && s.status !== "skipped");
  const weekDone = week.filter((s) => s.status === "completed").reduce((a, s) => a + s.minutes, 0);
  const weekTotal = week.reduce((a, s) => a + s.minutes, 0);
  const upcoming = [...active].sort((a, b) => `${a.dueDate} ${a.dueTime ?? "23:59"}`.localeCompare(`${b.dueDate} ${b.dueTime ?? "23:59"}`)).slice(0, 5);
  const courseOf = (id) => courses.find((c) => c.id === id);
  const taskOf = (id) => tasks.find((t) => t.id === id);

  if (courses.length === 0 || tasks.length === 0) {
    return (
      <>
        <PageHeader title="Welcome to LoadWise" description="Three quick steps and you will see your workload, warnings and study plan." />
        <Card className="divide-y divide-line">
          {[
            { icon: BookOpen, done: courses.length > 0, title: "Add your courses", body: "Everything is organised by course.", action: <Button onClick={() => setCourseOpen(true)}>Add a course</Button> },
            { icon: CheckSquare, done: tasks.length > 0, title: "Add tests, assignments and exams", body: "Include due dates and roughly how many hours you need to prepare.", action: <Button disabled={courses.length === 0} onClick={() => setTaskOpen(true)}>Add a task</Button> },
            { icon: SlidersHorizontal, done: false, title: "Set your study hours", body: "Tell LoadWise when you can study so plans are realistic.", action: <Link href="/settings" className="flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-medium hover:bg-surface-2 md:min-h-9">Open settings</Link> },
          ].map((s, i) => (
            <div key={s.title} className="flex flex-wrap items-center gap-4 p-4">
              <s.icon size={22} className={s.done ? "text-ok" : "text-primary"} aria-hidden />
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-medium">{i + 1}. {s.title}{s.done ? " (done)" : ""}</p>
                <p className="t-small">{s.body}</p>
              </div>
              {s.action}
            </div>
          ))}
        </Card>
        <CourseDialog open={courseOpen} onClose={() => setCourseOpen(false)} />
        <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`${formatDay(todayKey)}. Here is where your workload stands.`} actions={<Button icon={CheckSquare} onClick={() => setTaskOpen(true)}>Add task</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <h2 className="t-label mb-3">Workload</h2>
            <ScoreMeter workload={workload} />
            <ul className="mt-4 flex flex-col gap-1.5 text-sm">
              {workload.insights.slice(0, 3).map((i) => <li key={i.code + i.text} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{i.text}</li>)}
            </ul>
            <Link href="/insights" className="mt-3 inline-block text-sm font-medium text-primary underline">See how this is calculated</Link>
          </Card>

          <section aria-labelledby="warn-h">
            <div className="mb-2 flex items-center justify-between"><h2 id="warn-h" className="t-section">Needs attention</h2><Link href="/notifications" className="text-sm font-medium text-primary underline">All warnings</Link></div>
            {warningsShown.length === 0 ? <Banner tone="low" title="No active warnings">Nothing needs urgent action right now.</Banner> : (
              <div className="flex flex-col gap-3">{warningsShown.slice(0, 3).map((w) => <WarningItem key={w.key} w={w} />)}</div>
            )}
          </section>

          <Card>
            <div className="flex items-center justify-between border-b border-line p-4"><h2 className="t-section">Study today</h2><Link href="/planner" className="text-sm font-medium text-primary underline">Planner</Link></div>
            {todays.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No study sessions today" action={<Link href="/planner" className="flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-white md:min-h-9">Open planner</Link>}>
                {sessions.length === 0 ? "Generate a plan to see what to study and when." : "You have nothing scheduled for today."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {todays.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 p-3 sm:px-4">
                    <span className="tnum w-24 shrink-0 text-sm">{formatClock(s.startsAt)}-{formatClock(s.endsAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${s.status === "completed" ? "text-muted line-through" : ""}`}>{taskOf(s.taskId)?.title ?? "Study session"}</p>
                      <p className="t-small truncate">{courseOf(s.courseId)?.code ?? ""} {s.minutes} min</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="flex items-center justify-between border-b border-line p-4"><h2 className="t-section">Upcoming deadlines</h2><Link href="/calendar" className="text-sm font-medium text-primary underline">Calendar</Link></div>
            {upcoming.length === 0 ? <p className="t-small p-4">All tasks are complete.</p> : (
              <ul className="divide-y divide-line">{upcoming.map((t) => <li key={t.id} className="p-3 sm:px-4"><p className="truncate font-medium">{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></li>)}</ul>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="t-section">Study progress, next 7 days</h2>
            {weekTotal === 0 ? <p className="t-small mt-2">No sessions scheduled this week.</p> : (
              <>
                <p className="tnum mt-2 text-sm">{formatHours(weekDone / 60)} of {formatHours(weekTotal / 60)} completed</p>
                <div className="mt-2 h-2 overflow-hidden rounded-sm bg-surface-2 ring-1 ring-line"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round((weekDone / weekTotal) * 100)}%` }} /></div>
              </>
            )}
          </Card>
          <Card>
            <div className="flex items-center justify-between border-b border-line p-4"><h2 className="t-section">Courses by workload</h2><Link href="/courses" className="text-sm font-medium text-primary underline">Courses</Link></div>
            {workload.perCourse.length === 0 ? <p className="t-small p-4">No active tasks.</p> : (
              <ul className="divide-y divide-line">{workload.perCourse.slice(0, 5).map((c) => (
                <li key={String(c.courseId)} className="flex items-center gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.course?.code ?? c.course?.name ?? "No course"}</p><p className="t-small">{c.activeTasks} active, {formatHours(c.remainingHours)} to prepare</p></div>
                  <span className="tnum text-sm font-semibold">{c.score}</span>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}

export default function Page() { return <ReadyGate><Dashboard /></ReadyGate>; }
