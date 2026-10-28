"use client";
import { useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, PageHeader, Progress, useToast } from "@/components/ui";
import { CourseDialog, ReadyGate, useCourseColor } from "@/components/domain";
import { useData } from "@/lib/store";
import { formatDay, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

const ZONE_TEXT = { low: "text-ok", medium: "text-primary", high: "text-warn", critical: "text-crit" };

function Stat({ label, value }) {
  return <div><dt className="t-label">{label}</dt><dd className="tnum mt-1 text-sm font-medium">{value}</dd></div>;
}

function Courses() {
  const { courses, tasks, workload, deleteCourse } = useData();
  const toast = useToast();
  const colorOf = useCourseColor();
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const stats = new Map(workload.perCourse.map((c) => [c.courseId, c]));
  const taskCount = (id) => tasks.filter((t) => t.courseId === id).length;
  const activeTotal = workload.perCourse.reduce((a, c) => a + c.activeTasks, 0);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try { await deleteCourse(del.id, taskCount(del.id) > 0); setDel(null); toast("Course deleted"); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const editCourse = (c) => { setEdit(c); setOpen(true); };

  return (
    <>
      <PageHeader eyebrow="Semester" title="Courses" description="Set a priority for each course; higher priority courses count slightly more in your workload and plan." actions={<Button icon={Plus} onClick={() => { setEdit(null); setOpen(true); }}>Add course</Button>} />
      {courses.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="No courses yet" action={<Button onClick={() => { setEdit(null); setOpen(true); }}>Add your first course</Button>}>Add the courses you are taking this semester, then attach tests, assignments and exams to them.</EmptyState></Card>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-3 divide-x divide-line border-y border-line-strong py-4">
            {[[courses.length, "Courses"], [activeTotal, "Active tasks"], [formatHours(workload.totals.remainingHours), "To prepare"]].map(([v, l], i) => (
              <div key={l} className={`flex flex-col-reverse ${i === 0 ? "pr-4" : "px-4"}`}><dt className="t-label mt-2">{l}</dt><dd className="t-num tnum text-[2.5rem] sm:text-[3.25rem]">{v}</dd></div>
            ))}
          </dl>
          <Card>
            <ul className="divide-y divide-line">
              {courses.map((c) => {
                const s = stats.get(c.id);
                return (
                  <li key={c.id} className="ledger-row grid items-center gap-x-5 gap-y-3 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]" style={{ boxShadow: `inset 4px 0 0 ${colorOf(c.id)}` }}>
                    <div className="min-w-0 pl-1.5">
                      <p className="font-mono text-sm font-medium">{c.code}</p>
                      <h2 className="font-display text-[1.5rem] leading-tight break-words">{c.name}</h2>
                      <p className="mt-2 flex flex-wrap gap-1.5 empty:hidden">
                        {s?.multipleUpcomingDeadlines ? <Badge tone="warning">Multiple deadlines within 7 days</Badge> : null}
                        {s?.overdueTasks ? <Badge tone="critical">{s.overdueTasks} overdue</Badge> : null}
                      </p>
                    </div>
                    <div className="pl-1.5 lg:pl-0">
                      {s ? (
                        <div className="flex items-center gap-3">
                          <span className="t-num tnum w-14 text-[2.5rem]">{s.score}</span>
                          <div className="min-w-0 flex-1"><p className={`t-label mb-1.5 ${ZONE_TEXT[s.category]}`}>{s.category}</p><Progress value={s.score} zone={s.category} label={`${c.code} workload ${s.score} out of 100`} /></div>
                        </div>
                      ) : <p className="t-small">No active tasks</p>}
                    </div>
                    <dl className="grid grid-cols-3 gap-3 pl-1.5 lg:pl-0">
                      <Stat label="Active" value={s?.activeTasks ?? 0} />
                      <Stat label="To prepare" value={formatHours(s?.remainingHours ?? 0)} />
                      <Stat label="Next due" value={s?.nextDue ? formatDay(toDateKey(s.nextDue)) : "None"} />
                    </dl>
                    <div className="flex gap-1 pl-1.5 lg:pl-0">
                      <Button variant="secondary" icon={Pencil} className="flex-1 lg:hidden" onClick={() => editCourse(c)}>Edit</Button>
                      <Button variant="ghost" icon={Trash2} className="flex-1 lg:hidden" onClick={() => { setErr(null); setDel(c); }}>Delete</Button>
                      <IconButton label={`Edit ${c.code}`} icon={Pencil} className="hidden lg:flex" onClick={() => editCourse(c)} />
                      <IconButton label={`Delete ${c.code}`} icon={Trash2} tone="danger" className="hidden lg:flex" onClick={() => { setErr(null); setDel(c); }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
      <CourseDialog open={open} onClose={() => setOpen(false)} course={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirm} busy={busy} error={err} title={`Delete ${del?.code ?? "course"}?`}>
        {del && taskCount(del.id) > 0
          ? `This also permanently deletes ${taskCount(del.id)} task${taskCount(del.id) === 1 ? "" : "s"} and their study sessions. This cannot be undone.`
          : "This course has no tasks. It will be permanently deleted."}
      </ConfirmDialog>
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="list"><Courses /></ReadyGate>; }
