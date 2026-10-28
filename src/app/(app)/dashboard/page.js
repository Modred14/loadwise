"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, CalendarCheck, Check, CheckSquare, SlidersHorizontal } from "lucide-react";
import { Banner, Button, Card, CardHead, EmptyState, PageHeader, Progress, cx } from "@/components/ui";
import { CourseDialog, CourseTag, ReadyGate, TaskDialog, TaskMeta, WarningItem, useCourseColor } from "@/components/domain";
import { Fortnight, FitCheck, ScoreMeter } from "@/components/viz";
import { useData } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { formatClock, formatDayLong, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

const link = "inline-flex min-h-(--ctl-h) items-center gap-1 text-sm font-medium underline decoration-1 underline-offset-4 hover:decoration-2";
const SEV_DOT = { critical: "var(--zone-critical)", warning: "var(--zone-high)", info: "var(--zone-medium)" };

function Onboarding({ courses, tasks }) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const steps = [
    { icon: BookOpen, done: courses.length > 0, title: "Add your courses", body: "Everything is organised by course.", action: <Button onClick={() => setCourseOpen(true)}>Add a course</Button> },
    { icon: CheckSquare, done: tasks.length > 0, title: "Add tests, assignments and exams", body: "Include due dates and roughly how many hours you need to prepare.", action: <Button disabled={courses.length === 0} onClick={() => setTaskOpen(true)}>Add a task</Button> },
    { icon: SlidersHorizontal, done: false, title: "Set your study hours", body: "Tell LoadWise when you can study so plans are realistic.", action: <Link href="/settings" className="inline-flex min-h-(--ctl-h) items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:border-ink hover:bg-surface-2">Open settings</Link> },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <>
      <PageHeader eyebrow="Getting started" title="Welcome to LoadWise" description="Three quick steps and you will see your workload, warnings and study plan." />
      <Card className="anim-page">
        <ol>
          {steps.map((s, i) => (
            <li key={s.title} className={cx("relative flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line p-5 last:border-b-0", i === current ? "bg-surface" : "bg-surface-2/50")}>
              <span className={cx("flex size-11 shrink-0 items-center justify-center border font-display text-2xl", s.done ? "border-ok bg-ok text-white" : i === current ? "border-ink bg-ink text-white" : "border-line-strong text-muted")} aria-hidden>
                {s.done ? <Check size={20} strokeWidth={2.5} /> : `${i + 1}`}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex items-center gap-2 font-medium"><s.icon size={16} className="text-muted" aria-hidden />{s.title}{s.done ? <span className="t-label text-ok"> done</span> : null}</p>
                <p className="t-small mt-0.5">{s.body}</p>
              </div>
              {s.action}
            </li>
          ))}
        </ol>
      </Card>
      <CourseDialog open={courseOpen} onClose={() => setCourseOpen(false)} />
      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}

function Dashboard() {
  const d = useData();
  const { user } = useAuth();
  const colorOf = useCourseColor();
  const [taskOpen, setTaskOpen] = useState(false);
  const { workload, tasks, courses, sessions, now, warningsShown, prefs } = d;
  if (courses.length === 0 || tasks.length === 0) return <Onboarding courses={courses} tasks={tasks} />;

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
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = user?.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader eyebrow={formatDayLong(todayKey)} title={`${greeting}${first ? `, ${first}` : ""}.`} description="Here is where your workload stands." actions={<Button icon={CheckSquare} onClick={() => setTaskOpen(true)}>Add task</Button>} />
      <div className="stagger grid items-start gap-5 lg:grid-cols-12 *:min-w-0">
        {/* Instrument panel */}
        <section aria-labelledby="load-h" className="panel rounded-lg p-5 sm:p-7 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h2 id="load-h" className="t-label">Workload score</h2>
            <Link href="/insights" className={link}>How this is calculated <ArrowRight size={14} aria-hidden /></Link>
          </div>
          <div className="mt-5"><ScoreMeter workload={workload} /></div>
          <ul className="mt-7 grid gap-x-8 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-1">
            {workload.insights.slice(0, 3).map((i) => (
              <li key={i.code + i.text} className="flex gap-3"><span className="mt-[0.45rem] size-2 shrink-0" style={{ background: SEV_DOT[i.severity] }} aria-hidden /><span>{i.text}</span></li>
            ))}
          </ul>
        </section>

        {/* Early warnings */}
        <section aria-labelledby="warn-h" className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <div className="mb-3 flex items-center justify-between"><h2 id="warn-h" className="t-section">Needs attention</h2><Link href="/notifications" className="inline-flex min-h-(--ctl-h) items-center text-sm font-medium text-primary underline underline-offset-4">All warnings</Link></div>
          {warningsShown.length === 0 ? <Banner tone="low" title="No active warnings">Nothing needs urgent action right now.</Banner> : (
            <div className="flex flex-col gap-3">{warningsShown.slice(0, 3).map((w) => <WarningItem key={w.key} w={w} />)}</div>
          )}
        </section>

        {/* Ledger: today, deadlines, courses (one card, three sections) */}
        <Card className="lg:col-span-5 lg:col-start-8 lg:row-start-3">
          <CardHead title="Study today" action={<Link href="/planner" className="inline-flex min-h-(--ctl-h) items-center text-sm font-medium text-primary underline underline-offset-4">Planner</Link>} />
          {weekTotal > 0 ? (
            <div className="border-b border-line px-4 py-3">
              <p className="tnum flex justify-between text-xs"><span className="t-label">Next 7 days</span><span>{formatHours(weekDone / 60)} of {formatHours(weekTotal / 60)} done</span></p>
              <Progress value={(weekDone / weekTotal) * 100} zone="medium" label="Study completed in the next 7 days" className="mt-2" />
            </div>
          ) : null}
          {todays.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No study sessions today" action={<Link href="/planner" className="inline-flex min-h-(--ctl-h) items-center rounded-md bg-primary px-4 text-sm font-medium text-white shadow-key">Open planner</Link>}>
              {sessions.length === 0 ? "Generate a plan to see what to study and when." : "You have nothing scheduled for today."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {todays.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="course-mark h-9 w-1 shrink-0" style={{ "--c": colorOf(s.courseId) }} aria-hidden />
                  <span className="tnum w-24 shrink-0 font-mono text-[0.8125rem]">{formatClock(s.startsAt)}–{formatClock(s.endsAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cx("truncate text-sm font-medium", s.status === "completed" && "text-muted line-through")}>{taskOf(s.taskId)?.title ?? "Study session"}</p>
                    <p className="t-small truncate">{courseOf(s.courseId)?.code ?? ""} · {s.minutes} min</p>
                  </div>
                  {s.status === "completed" ? <Check size={16} className="shrink-0 text-ok" aria-label="Completed" /> : null}
                </li>
              ))}
            </ul>
          )}

          <CardHead title="Upcoming deadlines" className="border-t" action={<Link href="/calendar" className="inline-flex min-h-(--ctl-h) items-center text-sm font-medium text-primary underline underline-offset-4">Calendar</Link>} />
          {upcoming.length === 0 ? <p className="t-small p-4">All tasks are complete.</p> : (
            <ul className="divide-y divide-line">{upcoming.map((t) => <li key={t.id} className="ledger-row px-4 py-3"><p className="truncate text-sm font-medium">{t.title}</p><TaskMeta task={t} now={now} course={courseOf(t.courseId)} /></li>)}</ul>
          )}

          <CardHead title="Courses by workload" className="border-t" action={<Link href="/courses" className="inline-flex min-h-(--ctl-h) items-center text-sm font-medium text-primary underline underline-offset-4">Courses</Link>} />
          {workload.perCourse.length === 0 ? <p className="t-small p-4">No active tasks.</p> : (
            <ul className="divide-y divide-line">{workload.perCourse.slice(0, 5).map((c) => (
              <li key={String(c.courseId)} className="ledger-row flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <CourseTag course={c.course} className="text-sm" />
                  <p className="t-small mt-0.5">{c.activeTasks} active · {formatHours(c.remainingHours)} to prepare</p>
                  <Progress value={c.score} zone={c.category} label={`${c.course?.code ?? "Course"} load ${c.score}`} className="mt-2" />
                </div>
                <span className="t-num tnum w-10 text-right text-[2rem]">{c.score}</span>
              </li>
            ))}</ul>
          )}
        </Card>

        {/* Forecast */}
        <Card className="lg:col-span-7 lg:col-start-1 lg:row-start-2">
          <CardHead title="The next 14 days" action={<span className="t-label hidden sm:inline">Deadlines and planned study</span>} />
          <Fortnight tasks={tasks} sessions={sessions} prefs={prefs} now={now} />
        </Card>
        <Card className="lg:col-span-7 lg:col-start-1 lg:row-start-3">
          <CardHead title="Will it all fit?" action={<span className="t-label hidden sm:inline">Needed vs available hours</span>} />
          <FitCheck tasks={tasks} courses={courses} prefs={prefs} now={now} />
        </Card>
      </div>
      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}

export default function Page() { return <ReadyGate skeleton="dashboard"><Dashboard /></ReadyGate>; }
