"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, CheckSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { ReadyGate, TaskDialog, TaskMeta } from "@/components/domain";
import { TASK_TYPES, TYPE_CONFIG } from "@/lib/engine/config";
import { useData } from "@/lib/store";
import { dueInstant } from "@/lib/engine";
import { formatDue, relativeDue, typeLabel } from "@/lib/format";

const PAGE = 40;

function Tasks() {
  const { tasks, courses, now, setTaskStatus, deleteTask } = useData();
  const [f, setF] = useState({ q: "", course: "", type: "", status: "open", sort: "urgency" });
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const courseOf = (id) => courses.find((c) => c.id === id);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setLimit(PAGE); };

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = tasks.filter((t) => {
      const c = courses.find((x) => x.id === t.courseId);
      if (f.course && t.courseId !== f.course) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.status === "open" && t.status === "completed") return false;
      if (f.status === "completed" && t.status !== "completed") return false;
      if (f.status === "overdue" && !(t.status !== "completed" && dueInstant(t.dueDate, t.dueTime) <= now)) return false;
      if (q && !`${t.title} ${t.description ?? ""} ${c?.name ?? ""} ${c?.code ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const due = (t) => dueInstant(t.dueDate, t.dueTime)?.getTime() ?? Infinity;
    return list.sort((a, b) => {
      if (f.sort === "urgency") {
        const ca = a.status === "completed" ? 1 : 0, cb = b.status === "completed" ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return due(a) - due(b) || (b.importance ?? 3) - (a.importance ?? 3);
      }
      if (f.sort === "importance") return (b.importance ?? 3) - (a.importance ?? 3) || due(a) - due(b);
      return a.title.localeCompare(b.title);
    });
  }, [tasks, courses, f, now]);

  const toggle = async (t) => {
    setBusy(t.id); setErr(null);
    try { await setTaskStatus(t, t.status === "completed" ? "todo" : "completed"); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const confirmDelete = async () => {
    setBusy("del"); setErr(null);
    try { await deleteTask(del.id); setDel(null); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const shown = rows.slice(0, limit);
  const Check = ({ t }) => (
    <button type="button" onClick={() => toggle(t)} disabled={busy === t.id} aria-label={t.status === "completed" ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ok disabled:opacity-50 md:size-9">
      {t.status === "completed" ? <CheckCircle2 size={22} className="text-ok" aria-hidden /> : <Circle size={22} aria-hidden />}
    </button>
  );

  return (
    <>
      <PageHeader title="Tasks" description="Tests, assignments, continuous assessments, projects and exams." actions={<Button icon={Plus} onClick={() => { setEdit(null); setOpen(true); }}>Add task</Button>} />
      {err ? <div className="mb-4"><Banner title="Action failed">{err}</Banner></div> : null}
      <Card className="mb-4 grid grid-cols-2 gap-3 p-3 lg:grid-cols-5">
        <div className="relative col-span-2 lg:col-span-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search tasks" placeholder="Search" className="pl-9" value={f.q} onChange={set("q")} />
        </div>
        <Select aria-label="Filter by course" value={f.course} onChange={set("course")}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}</Select>
        <Select aria-label="Filter by type" value={f.type} onChange={set("type")}><option value="">All types</option>{TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}</Select>
        <Select aria-label="Filter by status" value={f.status} onChange={set("status")}><option value="open">Not completed</option><option value="overdue">Overdue</option><option value="completed">Completed</option><option value="all">All</option></Select>
        <Select aria-label="Sort" value={f.sort} onChange={set("sort")}><option value="urgency">Sort: urgency</option><option value="importance">Sort: importance</option><option value="title">Sort: title</option></Select>
      </Card>

      {tasks.length === 0 ? (
        <Card><EmptyState icon={CheckSquare} title="No tasks yet" action={<Button disabled={courses.length === 0} onClick={() => setOpen(true)}>Add your first task</Button>}>{courses.length === 0 ? "Add a course first, then attach tasks to it." : "Add a test, assignment or exam to start tracking your workload."}</EmptyState></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No tasks match these filters"><Button variant="secondary" onClick={() => setF({ q: "", course: "", type: "", status: "all", sort: "urgency" })}>Clear filters</Button></EmptyState></Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-line bg-surface-2 text-left"><tr>
                <th className="w-12 p-2"><span className="sr-only">Done</span></th><th className="p-2 font-semibold">Task</th><th className="w-28 p-2 font-semibold">Type</th><th className="w-44 p-2 font-semibold">Due</th><th className="w-20 p-2 font-semibold">Hours</th><th className="w-24 p-2"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {shown.map((t) => {
                  const c = courseOf(t.courseId);
                  const overdue = t.status !== "completed" && relativeDue(t, now).startsWith("Overdue");
                  return (
                    <tr key={t.id} className={t.status === "completed" ? "text-muted" : ""}>
                      <td className="p-1 text-center"><Check t={t} /></td>
                      <td className="p-2"><p className={`truncate font-medium ${t.status === "completed" ? "line-through" : ""}`} title={t.title}>{t.title}</p><p className="t-small truncate">{c ? `${c.code} - ${c.name}` : "No course"}</p></td>
                      <td className="p-2">{typeLabel(t.type)}</td>
                      <td className="p-2"><p className="tnum">{formatDue(t)}</p><p className={`text-xs ${overdue ? "font-medium text-crit" : "text-muted"}`}>{t.status === "completed" ? "Completed" : relativeDue(t, now)}</p></td>
                      <td className="tnum p-2">{t.estimatedHours ?? TYPE_CONFIG[t.type]?.defaultHours}h</td>
                      <td className="p-1"><div className="flex justify-end">
                        <button type="button" aria-label={`Edit ${t.title}`} onClick={() => { setEdit(t); setOpen(true); }} className="flex size-9 items-center justify-center rounded-md hover:bg-surface-2"><Pencil size={16} aria-hidden /></button>
                        <button type="button" aria-label={`Delete ${t.title}`} onClick={() => { setErr(null); setDel(t); }} className="flex size-9 items-center justify-center rounded-md hover:bg-crit-soft hover:text-crit"><Trash2 size={16} aria-hidden /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <ul className="flex flex-col gap-3 md:hidden">
            {shown.map((t) => (
              <li key={t.id}>
                <Card className="flex items-start gap-1 p-2">
                  <Check t={t} />
                  <div className="min-w-0 flex-1 py-1.5">
                    <p className={`break-words font-medium ${t.status === "completed" ? "text-muted line-through" : ""}`}>{t.title}</p>
                    <TaskMeta task={t} now={now} course={courseOf(t.courseId)} />
                    <div className="mt-1.5 flex items-center gap-2"><Badge>{t.estimatedHours ?? TYPE_CONFIG[t.type]?.defaultHours}h prep</Badge></div>
                  </div>
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Edit ${t.title}`} onClick={() => { setEdit(t); setOpen(true); }} className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2"><Pencil size={16} aria-hidden /></button>
                    <button type="button" aria-label={`Delete ${t.title}`} onClick={() => { setErr(null); setDel(t); }} className="flex size-11 items-center justify-center rounded-md hover:bg-crit-soft hover:text-crit"><Trash2 size={16} aria-hidden /></button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <p className="t-small mt-3" aria-live="polite">Showing {shown.length} of {rows.length}</p>
          {rows.length > shown.length ? <Button variant="secondary" className="mt-2" onClick={() => setLimit((l) => l + PAGE)}>Show more</Button> : null}
        </>
      )}
      <TaskDialog open={open} onClose={() => setOpen(false)} task={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy === "del"} error={err} title="Delete task?">
        {del ? `"${del.title}" and its planned study sessions will be permanently deleted.` : ""}
      </ConfirmDialog>
    </>
  );
}
export default function Page() { return <ReadyGate><Tasks /></ReadyGate>; }
