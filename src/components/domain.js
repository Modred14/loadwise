"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Banner, Button, Dialog, Field, Input, Select, SeverityBadge, Skeleton, Textarea } from "@/components/ui";
import { TASK_TYPES, TYPE_CONFIG } from "@/lib/engine/config";
import { useData } from "@/lib/store";
import { formatClock, formatDay, formatDue, relativeDue, typeLabel } from "@/lib/format";

export const IMPORTANCE_LABELS = { 1: "1 - Low", 2: "2 - Below normal", 3: "3 - Normal", 4: "4 - High", 5: "5 - Critical" };
const BAR = { low: "bg-ok", medium: "bg-primary", high: "bg-warn", critical: "bg-crit" };

export function ScoreMeter({ workload, size = "lg" }) {
  const { score, category, categoryLabel } = workload;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className={`tnum font-semibold tracking-tight ${size === "lg" ? "text-5xl" : "text-3xl"}`} aria-label={`Workload score ${score} out of 100`}>{score}</span>
        <span className="t-small">/ 100</span>
        <Badge tone={category}>{categoryLabel}</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-sm bg-surface-2 ring-1 ring-line" role="presentation">
        <div className={`h-full transition-[width] duration-500 ease-out ${BAR[category]}`} style={{ width: `${Math.max(score, 2)}%` }} />
      </div>
    </div>
  );
}

export function LoadingBlocks() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" />
    </div>
  );
}

export function WarningItem({ w, onDismiss, onRead, busy }) {
  const { courses } = useData();
  const course = courses.find((c) => c.id === w.courseId);
  return (
    <div className={`rounded-lg border p-3 ${w.severity === "critical" ? "border-crit/40 bg-crit-soft/40" : w.severity === "warning" ? "border-warn/30 bg-warn-soft/40" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={w.severity} />
        {course ? <Badge>{course.code ?? course.name}</Badge> : null}
        {w.actionBy ? <span className="t-small tnum ml-auto">Act by {formatDay(w.actionBy.slice(0, 10))}, {formatClock(w.actionBy)}</span> : null}
      </div>
      <p className="mt-2 font-medium">{w.title}</p>
      <p className="mt-1 text-sm text-muted">{w.why}</p>
      <p className="mt-2 text-sm"><span className="font-medium">Next: </span>{w.nextStep}</p>
      {(onDismiss || onRead) && w.id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onRead && !w.readAt ? <Button variant="secondary" icon={Check} loading={busy === `r${w.id}`} onClick={() => onRead(w)}>Mark read</Button> : null}
          {onDismiss ? <Button variant="ghost" icon={X} loading={busy === `d${w.id}`} onClick={() => onDismiss(w)}>Dismiss</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TaskMeta({ task, now, course }) {
  const overdue = now && relativeDue(task, now).startsWith("Overdue") && task.status !== "completed";
  return (
    <p className="t-small mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {course ? <span className="font-medium text-ink">{course.code ?? course.name}</span> : null}
      <span>{typeLabel(task.type)}</span>
      <span className="tnum">{formatDue(task)}</span>
      {task.status === "completed" ? <Badge tone="low">Completed</Badge> : overdue ? <Badge tone="critical">{relativeDue(task, now)}</Badge> : <span>{relativeDue(task, now)}</span>}
    </p>
  );
}

function useSubmit(action, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const run = async () => {
    if (busy) return; // protects against double submission
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e.message);
      setFields(e.fields ?? {});
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, setFields, setError, run };
}

const emptyTask = (courseId = "") => ({ title: "", description: "", courseId, type: "assignment", dueDate: "", dueTime: "", estimatedHours: "", importance: 3, status: "todo" });

export function TaskDialog({ open, ...props }) {
  // Mounted only while open so the form always starts from fresh state (no reset effect to race with typing).
  return open ? <TaskDialogInner {...props} /> : null;
}

function TaskDialogInner({ onClose, task, defaultCourseId }) {
  const open = true;
  const { courses, saveTask } = useData();
  const [form, setForm] = useState(() => (task ? { ...emptyTask(), ...task, dueTime: task.dueTime ?? "", estimatedHours: task.estimatedHours ?? "", description: task.description ?? "" } : emptyTask(defaultCourseId ?? courses[0]?.id ?? "")));
  const [local, setLocal] = useState({});
  const sub = useSubmit(async () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "Enter a title";
    if (!form.courseId) errs.courseId = "Choose a course";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errs.dueDate = "Choose a due date";
    const hours = form.estimatedHours === "" ? null : Number(form.estimatedHours);
    if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 200)) errs.estimatedHours = "Enter hours between 0.5 and 200";
    setLocal(errs);
    if (Object.keys(errs).length) throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} });
    await saveTask(task?.id ?? null, {
      title: form.title.trim(), description: form.description.trim(), courseId: form.courseId, type: form.type,
      dueDate: form.dueDate, dueTime: form.dueTime || null, estimatedHours: hours, importance: Number(form.importance),
      status: form.status, completedAt: form.status === "completed" ? (task?.completedAt ?? new Date().toISOString()) : null,
    });
  }, onClose);


  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k) => local[k] ?? sub.fields[k];
  const hint = `Default for ${typeLabel(form.type).toLowerCase()}: ${TYPE_CONFIG[form.type].defaultHours}h`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "Add task"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={sub.busy} onClick={sub.run} disabled={courses.length === 0}>{task ? "Save changes" : "Add task"}</Button></>}
    >
      {courses.length === 0 ? <Banner tone="warning" title="Add a course first">Tasks belong to a course.</Banner> : (
        <form onSubmit={(e) => { e.preventDefault(); sub.run(); }} noValidate className="flex flex-col gap-4">
          {sub.error ? <Banner title="Could not save the task">{sub.error}</Banner> : null}
          <Field label="Title" htmlFor="t-title" error={err("title")}><Input id="t-title" value={form.title} onChange={set("title")} aria-invalid={!!err("title")} maxLength={160} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" htmlFor="t-course" error={err("courseId")}>
              <Select id="t-course" value={form.courseId} onChange={set("courseId")} aria-invalid={!!err("courseId")}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" htmlFor="t-type">
              <Select id="t-type" value={form.type} onChange={set("type")}>{TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}</Select>
            </Field>
            <Field label="Due date" htmlFor="t-date" error={err("dueDate")}><Input id="t-date" type="date" value={form.dueDate} onChange={set("dueDate")} aria-invalid={!!err("dueDate")} /></Field>
            <Field label="Due time (optional)" htmlFor="t-time" error={err("dueTime")}><Input id="t-time" type="time" value={form.dueTime} onChange={set("dueTime")} /></Field>
            <Field label="Preparation needed (hours)" htmlFor="t-hours" hint={hint} error={err("estimatedHours")}>
              <Input id="t-hours" type="number" inputMode="decimal" step="0.5" min="0.5" value={form.estimatedHours} onChange={set("estimatedHours")} aria-invalid={!!err("estimatedHours")} />
            </Field>
            <Field label="Importance" htmlFor="t-imp">
              <Select id="t-imp" value={form.importance} onChange={set("importance")}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{IMPORTANCE_LABELS[n]}</option>)}</Select>
            </Field>
          </div>
          {task ? (
            <Field label="Status" htmlFor="t-status">
              <Select id="t-status" value={form.status} onChange={set("status")}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option></Select>
            </Field>
          ) : null}
          <Field label="Description (optional)" htmlFor="t-desc"><Textarea id="t-desc" value={form.description} onChange={set("description")} maxLength={1000} /></Field>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Dialog>
  );
}

export function CourseDialog({ open, ...props }) {
  return open ? <CourseDialogInner {...props} /> : null;
}

function CourseDialogInner({ onClose, course }) {
  const open = true;
  const { courses, saveCourse } = useData();
  const [form, setForm] = useState(() => (course ? { code: course.code ?? "", name: course.name ?? "", priority: course.priority ?? 3 } : { code: "", name: "", priority: 3 }));
  const [local, setLocal] = useState({});
  const sub = useSubmit(async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter the course name";
    if (!form.code.trim()) errs.code = "Enter a course code";
    else if (courses.some((c) => c.id !== course?.id && c.code?.toLowerCase() === form.code.trim().toLowerCase())) errs.code = "You already have a course with this code";
    setLocal(errs);
    if (Object.keys(errs).length) throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} });
    await saveCourse(course?.id ?? null, { code: form.code.trim(), name: form.name.trim(), priority: Number(form.priority) });
  }, onClose);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k) => local[k] ?? sub.fields[k];
  return (
    <Dialog open={open} onClose={onClose} title={course ? "Edit course" : "Add course"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={sub.busy} onClick={sub.run}>{course ? "Save changes" : "Add course"}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); sub.run(); }} noValidate className="flex flex-col gap-4">
        {sub.error ? <Banner title="Could not save the course">{sub.error}</Banner> : null}
        <Field label="Course code" htmlFor="c-code" error={err("code")}><Input id="c-code" value={form.code} onChange={set("code")} maxLength={20} aria-invalid={!!err("code")} /></Field>
        <Field label="Course name" htmlFor="c-name" error={err("name")}><Input id="c-name" value={form.name} onChange={set("name")} maxLength={120} aria-invalid={!!err("name")} /></Field>
        <Field label="Course priority" htmlFor="c-pri" hint="Higher priority courses count slightly more in workload and planning.">
          <Select id="c-pri" value={form.priority} onChange={set("priority")}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{IMPORTANCE_LABELS[n]}</option>)}</Select>
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export { formatClock };

export function ReadyGate({ children }) {
  const d = useData();
  if (d.status === "error") {
    return <Banner title="Could not load your data" action={<Button variant="secondary" onClick={d.reload}>Retry</Button>}>{d.error}</Banner>;
  }
  if (d.status !== "ready" || !d.workload) return <LoadingBlocks />;
  return children;
}
