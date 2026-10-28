"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, CheckSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Banner, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Segmented, Select, cx, useToast } from "@/components/ui";
import { CourseTag, Pips, ReadyGate, TaskDialog, TaskMeta, useCourseColor } from "@/components/domain";
import { TASK_TYPES, TYPE_CONFIG } from "@/lib/engine/config";
import { useData } from "@/lib/store";
import { dueInstant, toDateKey } from "@/lib/engine";
import { formatDue, relativeDue, typeLabel } from "@/lib/format";

const PAGE = 40;

function DoneToggle({ t, busy, onToggle }) {
  const done = t.status === "completed";
  return (
    <button type="button" onClick={() => onToggle(t)} disabled={busy === t.id} aria-pressed={done} aria-label={done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
      className="group flex size-(--ctl-h) shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-ok-soft hover:text-ok disabled:opacity-50">
      {done ? <CheckCircle2 size={22} className="anim-pop text-ok" aria-hidden /> : <Circle size={22} className="transition-transform group-active:scale-90" aria-hidden />}
    </button>
  );
}

function Tasks() {
  const { tasks, courses, now, setTaskStatus, deleteTask } = useData();
  const toast = useToast();
  const colorOf = useCourseColor();
  const [f, setF] = useState({ q: "", course: "", type: "", status: "open", sort: "urgency" });
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const courseOf = (id) => courses.find((c) => c.id === id);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setLimit(PAGE); };
  const setStatus = (v) => { setF((x) => ({ ...x, status: v })); setLimit(PAGE); };

  const isOverdue = (t) => t.status !== "completed" && dueInstant(t.dueDate, t.dueTime) <= now;
  const counts = useMemo(() => ({
    open: tasks.filter((t) => t.status !== "completed").length,
    overdue: tasks.filter((t) => t.status !== "completed" && dueInstant(t.dueDate, t.dueTime) <= now).length,
    completed: tasks.filter((t) => t.status === "completed").length,
    all: tasks.length,
  }), [tasks, now]);

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
    const completing = t.status !== "completed";
    try {
      await setTaskStatus(t, completing ? "completed" : "todo");
      toast(completing ? "Marked as done" : "Moved back to to-do");
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const confirmDelete = async () => {
    setBusy("del"); setErr(null);
    try { await deleteTask(del.id); setDel(null); toast("Task deleted"); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  // Urgency buckets are only a presentation of the existing sort order.
  const todayKey = toDateKey(now);
  const bucket = (t) => {
    if (t.status === "completed") return "Completed";
    const d = dueInstant(t.dueDate, t.dueTime);
    if (d && d <= now) return "Overdue";
    if (t.dueDate === todayKey) return "Today";
    if (d && d - now <= 7 * 86_400_000) return "Next 7 days";
    return "Later";
  };
  const shown = rows.slice(0, limit);
  const grouped = f.sort === "urgency";
  const entries = [];
  let last = null;
  for (const t of shown) {
    const b = grouped ? bucket(t) : null;
    if (grouped && b !== last) { entries.push({ group: b, n: rows.filter((r) => bucket(r) === b).length }); last = b; }
    entries.push({ t });
  }
  const edit_ = (t) => { setEdit(t); setOpen(true); };
  const ask = (t) => { setErr(null); setDel(t); };
  const hours = (t) => t.estimatedHours ?? TYPE_CONFIG[t.type]?.defaultHours;
  const stripe = (t) => ({ boxShadow: `inset 3px 0 0 ${colorOf(t.courseId)}` });

  return (
    <>
      <PageHeader eyebrow={`${counts.open} open · ${counts.overdue} overdue`} title="Tasks" description="Tests, assignments, continuous assessments, projects and exams." actions={<Button icon={Plus} onClick={() => { setEdit(null); setOpen(true); }}>Add task</Button>} />
      {err && !del ? <div className="mb-4"><Banner title="Action failed">{err}</Banner></div> : null}

      <div className="mb-4 flex flex-col gap-3">
        <Segmented label="Filter by status" value={f.status} onChange={setStatus} options={[
          { value: "open", label: "Open", count: counts.open },
          { value: "overdue", label: "Overdue", count: counts.overdue },
          { value: "completed", label: "Completed", count: counts.completed },
          { value: "all", label: "All", count: counts.all },
        ]} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative col-span-2 lg:col-span-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <Input aria-label="Search tasks" placeholder="Search tasks" className="pl-9" value={f.q} onChange={set("q")} />
          </div>
          <Select aria-label="Filter by course" value={f.course} onChange={set("course")}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}</Select>
          <Select aria-label="Filter by type" value={f.type} onChange={set("type")}><option value="">All types</option>{TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}</Select>
          <div className="col-span-2 lg:col-span-1"><Select aria-label="Sort" value={f.sort} onChange={set("sort")}><option value="urgency">Sort: urgency</option><option value="importance">Sort: importance</option><option value="title">Sort: title</option></Select></div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <Card><EmptyState icon={CheckSquare} title="No tasks yet" action={<Button disabled={courses.length === 0} onClick={() => setOpen(true)}>Add your first task</Button>}>{courses.length === 0 ? "Add a course first, then attach tasks to it." : "Add a test, assignment or exam to start tracking your workload."}</EmptyState></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Search} title="No tasks match these filters"><Button variant="secondary" onClick={() => setF({ q: "", course: "", type: "", status: "all", sort: "urgency" })}>Clear filters</Button></EmptyState></Card>
      ) : (
        <>
          {/* Desktop and tablet: ledger table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-line-strong bg-surface-2 text-left">
                <tr>
                  <th className="w-14 p-2"><span className="sr-only">Done</span></th>
                  <th className="t-label p-2 font-medium">Task</th>
                  <th className="t-label hidden w-32 p-2 font-medium xl:table-cell">Type</th>
                  <th className="t-label w-44 p-2 font-medium">Due</th>
                  <th className="t-label w-24 p-2 font-medium">Prep</th>
                  <th className="w-24 p-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => e.group ? (
                  <tr key={`g-${e.group}`} className="border-t border-line bg-bg/60"><th colSpan={6} scope="colgroup" className={cx("t-label p-2 pl-4 text-left font-medium", e.group === "Overdue" && "text-crit")}>{e.group} <span className="tnum text-muted">· {e.n}</span></th></tr>
                ) : (() => {
                  const t = e.t;
                  const c = courseOf(t.courseId);
                  const overdue = isOverdue(t);
                  return (
                    <tr key={t.id} className={cx("ledger-row border-t border-line", t.status === "completed" && "text-muted")}>
                      <td className="p-1 pl-2 text-center" style={stripe(t)}><DoneToggle t={t} busy={busy} onToggle={toggle} /></td>
                      <td className="p-2"><p className={cx("truncate font-medium", t.status === "completed" && "line-through")} title={t.title}>{t.title}</p><p className="mt-0.5 flex items-center gap-2 truncate"><CourseTag course={c} /><span className="t-small truncate">{c?.name ?? "No course"}</span></p></td>
                      <td className="hidden p-2 xl:table-cell">{typeLabel(t.type)}</td>
                      <td className="p-2"><p className="tnum">{formatDue(t)}</p><p className={cx("text-xs", overdue ? "font-medium text-crit" : "text-muted")}>{t.status === "completed" ? "Completed" : relativeDue(t, now)}</p></td>
                      <td className="p-2"><p className="tnum font-mono text-[0.8125rem]">{hours(t)}h</p><Pips n={t.importance ?? 3} className="mt-1" /></td>
                      <td className="p-1"><div className="flex justify-end"><IconButton label={`Edit ${t.title}`} icon={Pencil} onClick={() => edit_(t)} /><IconButton label={`Delete ${t.title}`} icon={Trash2} tone="danger" onClick={() => ask(t)} /></div></td>
                    </tr>
                  );
                })())}
              </tbody>
            </table>
          </Card>

          {/* Phones: one continuous list, thumb-sized controls */}
          <div className="overflow-hidden rounded-lg border border-line bg-surface md:hidden">
            <ul>
              {entries.map((e) => e.group ? (
                <li key={`g-${e.group}`} className={cx("t-label border-t border-line bg-bg/60 px-4 py-2 first:border-t-0", e.group === "Overdue" && "text-crit")}>{e.group} <span className="tnum">· {e.n}</span></li>
              ) : (
                <li key={e.t.id} className="flex items-start gap-1 border-t border-line py-1 pr-1 pl-2 first:border-t-0" style={stripe(e.t)}>
                  <DoneToggle t={e.t} busy={busy} onToggle={toggle} />
                  <div className="min-w-0 flex-1 py-2">
                    <p className={cx("font-medium break-words", e.t.status === "completed" && "text-muted line-through")}>{e.t.title}</p>
                    <TaskMeta task={e.t} now={now} course={courseOf(e.t.courseId)} />
                    <p className="mt-1.5 flex items-center gap-3 text-xs text-muted"><span className="tnum font-mono">{hours(e.t)}h prep</span><Pips n={e.t.importance ?? 3} /></p>
                  </div>
                  <div className="flex flex-col"><IconButton label={`Edit ${e.t.title}`} icon={Pencil} onClick={() => edit_(e.t)} /><IconButton label={`Delete ${e.t.title}`} icon={Trash2} tone="danger" onClick={() => ask(e.t)} /></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="t-small" aria-live="polite">Showing {shown.length} of {rows.length}</p>
            {rows.length > shown.length ? <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Show more</Button> : null}
          </div>
        </>
      )}
      <TaskDialog open={open} onClose={() => setOpen(false)} task={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy === "del"} error={err} title="Delete task?">
        {del ? `"${del.title}" and its planned study sessions will be permanently deleted.` : ""}
      </ConfirmDialog>
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="list"><Tasks /></ReadyGate>; }
