"use client";
import { useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader } from "@/components/ui";
import { CourseDialog, ReadyGate } from "@/components/domain";
import { useData } from "@/lib/store";
import { formatDay, formatHours } from "@/lib/format";
import { toDateKey } from "@/lib/engine";

function Courses() {
  const { courses, tasks, workload, deleteCourse } = useData();
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const stats = new Map(workload.perCourse.map((c) => [c.courseId, c]));
  const taskCount = (id) => tasks.filter((t) => t.courseId === id).length;

  const confirm = async () => {
    setBusy(true); setErr(null);
    try { await deleteCourse(del.id, taskCount(del.id) > 0); setDel(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Courses" description="Set a priority for each course; higher priority courses count slightly more in your workload and plan." actions={<Button icon={Plus} onClick={() => { setEdit(null); setOpen(true); }}>Add course</Button>} />
      {courses.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="No courses yet" action={<Button onClick={() => { setEdit(null); setOpen(true); }}>Add your first course</Button>}>Add the courses you are taking this semester, then attach tests, assignments and exams to them.</EmptyState></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => {
            const s = stats.get(c.id);
            return (
              <li key={c.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="t-small font-medium text-ink">{c.code}</p>
                      <h2 className="t-section break-words">{c.name}</h2>
                    </div>
                    {s ? <Badge tone={s.category}>{s.score}</Badge> : <Badge>No active tasks</Badge>}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="t-small">Active</dt><dd className="tnum font-medium">{s?.activeTasks ?? 0}</dd></div>
                    <div><dt className="t-small">To prepare</dt><dd className="tnum font-medium">{formatHours(s?.remainingHours ?? 0)}</dd></div>
                    <div><dt className="t-small">Next due</dt><dd className="tnum font-medium">{s?.nextDue ? formatDay(toDateKey(s.nextDue)) : "None"}</dd></div>
                  </dl>
                  {s?.multipleUpcomingDeadlines ? <p className="mt-3"><Badge tone="warning">Multiple deadlines within 7 days</Badge></p> : null}
                  {s?.overdueTasks ? <p className="mt-2"><Badge tone="critical">{s.overdueTasks} overdue</Badge></p> : null}
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" icon={Pencil} onClick={() => { setEdit(c); setOpen(true); }}>Edit</Button>
                    <Button variant="ghost" icon={Trash2} onClick={() => { setErr(null); setDel(c); }}>Delete</Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
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
export default function Page() { return <ReadyGate><Courses /></ReadyGate>; }
