"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Check } from "lucide-react";
import { Badge, Banner, Button, Dialog, Field, Input, Select, Skeleton, Textarea, cx, useToast } from "@/components/ui";
import { WarningCard } from "@/components/WarningCard";
import { ScoreMeter } from "@/components/viz";
import { TASK_TYPES, TYPE_CONFIG } from "@/lib/engine/config";
import { courseColors } from "@/lib/courseColor";
import { useData } from "@/lib/store";
import { formatClock, formatDue, relativeDue, typeLabel } from "@/lib/format";

export { ScoreMeter, WarningCard };
export const IMPORTANCE_LABELS = { 1: "1 - Low", 2: "2 - Below normal", 3: "3 - Normal", 4: "4 - High", 5: "5 - Critical" };

/* ---------------------------------------------------------------- Helpers */
/** Colour for a course, stable across screens. */
export function useCourseColor() {
  const { courses } = useData();
  const map = useMemo(() => courseColors(courses), [courses]);
  return (id) => map.get(id) ?? "var(--primary)";
}

export function CourseTag({ course, className }) {
  const colorOf = useCourseColor();
  if (!course) return null;
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5 font-mono text-xs font-medium text-ink", className)}>
      <span className="course-mark size-2 shrink-0" style={{ "--c": colorOf(course.id) }} aria-hidden />
      <span className="truncate">{course.code ?? course.name}</span>
    </span>
  );
}

/** Importance 1-5 as five small bars. */
export function Pips({ n = 3, className }) {
  return (
    <span className={cx("inline-flex items-end gap-0.5", className)} role="img" aria-label={`Importance ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("w-[3px]", i <= n ? "bg-ink" : "bg-line-strong/60")} style={{ height: 4 + i * 2 }} />)}
    </span>
  );
}

/* ---------------------------------------------------------------- Loading */
export function LoadingBlocks({ variant = "page" }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" role="status">
      <span className="sr-only">Loading</span>
      <div><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-10 w-64 max-w-full" /></div>
      {variant === "dashboard" ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-72 lg:col-span-7" /><Skeleton className="h-72 lg:col-span-5" />
          <Skeleton className="h-64 lg:col-span-7" /><Skeleton className="h-64 lg:col-span-5" />
        </div>
      ) : variant === "list" ? (
        <>
          <Skeleton className="h-14 w-full" />
          <div className="flex flex-col gap-px">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
      )}
    </div>
  );
}

export function ReadyGate({ children, skeleton }) {
  const d = useData();
  if (d.status === "error") {
    return <Banner title="Could not load your data" action={<Button variant="secondary" onClick={d.reload}>Retry</Button>}>{d.error}</Banner>;
  }
  if (d.status !== "ready" || !d.workload) return <LoadingBlocks variant={skeleton} />;
  return children;
}

/* --------------------------------------------------------------- Warnings */
export function WarningItem({ w, ...rest }) {
  const { courses } = useData();
  return <WarningCard w={w} course={courses.find((c) => c.id === w.courseId)} {...rest} />;
}

/* -------------------------------------------------------------- Task meta */
export function TaskMeta({ task, now, course }) {
  const rel = now ? relativeDue(task, now) : "";
  const overdue = rel.startsWith("Overdue") && task.status !== "completed";
  const soon = !overdue && task.status !== "completed" && (rel.startsWith("Due in") && rel.endsWith("h") || rel === "Due within the hour" || rel === "Due tomorrow");
  return (
    <p className="t-small mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {course ? <CourseTag course={course} /> : null}
      <span>{typeLabel(task.type)}</span>
      {task.sharedDeadlineId ? <Badge tone="info">Course rep</Badge> : null}
      <span className="tnum">{formatDue(task)}</span>
      {task.status === "completed" ? <Badge tone="low">Completed</Badge> : overdue ? <Badge tone="critical">{rel}</Badge> : <span className={soon ? "font-medium text-warn" : ""}>{rel}</span>}
    </p>
  );
}

/* ------------------------------------------------------------------ Forms */
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
  const toast = useToast();
  const { courses, saveTask } = useData();
  const locked = !!task?.sharedDeadlineId; // date, title and type are managed by the course rep
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
  }, () => { toast(task ? "Task updated" : "Task added"); onClose(); });

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
          {locked ? <Banner tone="info" title="Managed by your course rep">The title, type and date are set by your course rep and update automatically. You can still change your preparation time and importance.</Banner> : null}
          <Field label="Title" htmlFor="t-title" error={err("title")}><Input id="t-title" disabled={locked} value={form.title} onChange={set("title")} aria-invalid={!!err("title")} maxLength={160} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" htmlFor="t-course" error={err("courseId")}>
              <Select id="t-course" disabled={locked} value={form.courseId} onChange={set("courseId")} aria-invalid={!!err("courseId")}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" htmlFor="t-type">
              <Select id="t-type" disabled={locked} value={form.type} onChange={set("type")}>{TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}</Select>
            </Field>
            <Field label="Due date" htmlFor="t-date" error={err("dueDate")}><Input id="t-date" disabled={locked} type="date" value={form.dueDate} onChange={set("dueDate")} aria-invalid={!!err("dueDate")} /></Field>
            <Field label="Due time (optional)" htmlFor="t-time" error={err("dueTime")}><Input id="t-time" disabled={locked} type="time" value={form.dueTime} onChange={set("dueTime")} /></Field>
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
  const toast = useToast();
  const { courses, saveCourse } = useData();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    if (!user?.departmentId) return;
    let live = true;
    api.catalog.list().then((d) => live && setCatalog(d)).catch(() => {}); // optional enhancement; the form works without it
    return () => { live = false; };
  }, [user?.departmentId]);
  const [form, setForm] = useState(() => (course ? { code: course.code ?? "", name: course.name ?? "", priority: course.priority ?? 3, catalogId: course.catalogId ?? "" } : { code: "", name: "", priority: 3, catalogId: "" }));
  const [local, setLocal] = useState({});
  const pickCatalog = (e) => {
    const c = catalog.find((x) => x.id === e.target.value);
    setForm((f) => ({ ...f, catalogId: e.target.value, code: f.code || c?.code || "", name: f.name || c?.name || "" }));
  };
  const sub = useSubmit(async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter the course name";
    if (!form.code.trim()) errs.code = "Enter a course code";
    else if (courses.some((c) => c.id !== course?.id && c.code?.toLowerCase() === form.code.trim().toLowerCase())) errs.code = "You already have a course with this code";
    setLocal(errs);
    if (Object.keys(errs).length) throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} });
    await saveCourse(course?.id ?? null, { code: form.code.trim(), name: form.name.trim(), priority: Number(form.priority), ...(course || form.catalogId ? { catalogId: form.catalogId || null } : {}) });
  }, () => { toast(course ? "Course updated" : "Course added"); onClose(); });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k) => local[k] ?? sub.fields[k];
  return (
    <Dialog open={open} onClose={onClose} title={course ? "Edit course" : "Add course"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={sub.busy} onClick={sub.run}>{course ? "Save changes" : "Add course"}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); sub.run(); }} noValidate className="flex flex-col gap-4">
        {sub.error ? <Banner title="Could not save the course">{sub.error}</Banner> : null}
        {catalog.length ? (
          <Field label="Department course (optional)" htmlFor="c-cat" hint="Link this to the official course to receive dates from your course rep as tasks.">
            <Select id="c-cat" value={form.catalogId} onChange={pickCatalog}><option value="">Not linked</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.name}</option>)}</Select>
          </Field>
        ) : null}
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
