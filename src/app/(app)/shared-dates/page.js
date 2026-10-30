"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge, Banner, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { TASK_TYPES, TYPE_CONFIG } from "@/lib/engine/config";
import { formatDayLong, typeLabel } from "@/lib/format";
import Link from "next/link";

function DeadlineDialog({ open, onClose, deadline, catalog, onSaved }) {
  return open ? <Inner onClose={onClose} deadline={deadline} catalog={catalog} onSaved={onSaved} /> : null;
}

function Inner({ onClose, deadline, catalog, onSaved }) {
  const [form, setForm] = useState(() => ({ catalogId: deadline?.catalogId ?? catalog[0]?.id ?? "", title: deadline?.title ?? "", type: deadline?.type ?? "exam", dueDate: deadline?.dueDate ?? "", dueTime: deadline?.dueTime ?? "", description: deadline?.description ?? "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (busy) return;
    const v = {};
    if (!form.title.trim()) v.title = "Enter a title";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) v.dueDate = "Choose a date";
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError(null);
    try {
      const body = { title: form.title.trim(), type: form.type, dueDate: form.dueDate, dueTime: form.dueTime || null, description: form.description.trim() };
      const saved = deadline ? await api.shared.update(deadline.id, { ...body, version: deadline.version }) : await api.shared.create({ ...body, catalogId: form.catalogId });
      onSaved(saved, !deadline);
      onClose();
    } catch (e) { setError(e.message); if (e.fields) setErrs(e.fields); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={deadline ? "Edit shared deadline" : "Add shared deadline"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{deadline ? "Save and notify students" : "Add and notify students"}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate className="flex flex-col gap-4">
        {error ? <Banner title="Could not save">{error}</Banner> : null}
        <Banner tone="info">Students who linked this course get the deadline as a task automatically, and a notification when you change it.</Banner>
        {!deadline ? <Field label="Course" htmlFor="sd-course"><Select id="sd-course" value={form.catalogId} onChange={set("catalogId")}>{catalog.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.name}</option>)}</Select></Field> : null}
        <Field label="Title" htmlFor="sd-title" error={errs.title}><Input id="sd-title" value={form.title} onChange={set("title")} maxLength={160} aria-invalid={!!errs.title} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="sd-type"><Select id="sd-type" value={form.type} onChange={set("type")}>{TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}</Select></Field>
          <Field label="Date" htmlFor="sd-date" error={errs.dueDate}><Input id="sd-date" type="date" value={form.dueDate} onChange={set("dueDate")} aria-invalid={!!errs.dueDate} /></Field>
          <Field label="Time (optional)" htmlFor="sd-time" error={errs.dueTime}><Input id="sd-time" type="time" value={form.dueTime} onChange={set("dueTime")} /></Field>
        </div>
        <Field label="Details (optional)" htmlFor="sd-desc"><Textarea id="sd-desc" value={form.description} onChange={set("description")} maxLength={1000} /></Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export default function Page() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ status: "loading", items: [], catalog: [], error: null });
  const [dialog, setDialog] = useState({ open: false, deadline: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [items, catalog] = await Promise.all([api.shared.list(), api.catalog.list()]);
      setState({ status: "ready", items, catalog, error: null });
    } catch (e) { setState((s) => ({ ...s, status: "error", error: e.message })); }
  }, []);
  useEffect(() => { if (!user?.departmentId) return; const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load, user?.departmentId]);

  if (!user?.departmentId) {
    return (<><PageHeader eyebrow="From your course reps" title="Shared dates" /><Card><EmptyState icon={Users} title="Join your department first" action={<Link href="/settings" className="flex min-h-11 items-center bg-primary px-4 text-sm font-medium text-white md:min-h-9">Open settings</Link>}>Pick your department in Settings to see official test and exam dates shared by your course representatives.</EmptyState></Card></>);
  }
  const manageable = state.catalog.filter((c) => c.canManage);
  const canManage = (id) => manageable.some((c) => c.id === id);
  const byDate = new Map();
  for (const d of state.items) byDate.set(d.dueDate, [...(byDate.get(d.dueDate) ?? []), d]);

  const confirmDelete = async () => {
    setBusy(true); setErr(null);
    try { await api.shared.remove(del.id); setDel(null); toast("Shared deadline removed"); load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const saved = (d, created) => { toast(`${created ? "Added" : "Updated"}. ${d.studentsNotified ?? 0} student${d.studentsNotified === 1 ? "" : "s"} notified.`); load(); };

  return (
    <>
      <PageHeader eyebrow={user.departmentName} title="Shared dates" description="Official test, exam and assignment dates from course representatives. Link a course to its department course in Courses to get them as tasks automatically."
        actions={manageable.length ? <Button icon={Plus} onClick={() => setDialog({ open: true, deadline: null })}>Add deadline</Button> : null} />
      {state.status === "loading" ? <Spinner label="Loading shared dates" /> : null}
      {state.status === "error" ? <Banner title="Could not load shared dates" action={<Button variant="secondary" onClick={load}>Retry</Button>}>{state.error}</Banner> : null}
      {state.status === "ready" && !state.items.length ? <Card><EmptyState icon={CalendarClock} title="No shared dates yet">{manageable.length ? "Add the first deadline for the courses you represent." : "When a course rep adds a date, it appears here and in your tasks."}</EmptyState></Card> : null}
      {state.items.length ? (
        <div className="stagger flex max-w-3xl flex-col gap-6">
          {[...byDate].map(([date, list]) => (
            <section key={date} aria-label={formatDayLong(date)}>
              <h2 className="t-label mb-2">{formatDayLong(date)}</h2>
              <Card><ul className="divide-y divide-line">
                {list.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 p-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{d.title}</p>
                      <p className="t-small tnum"><span className="font-medium text-ink">{d.catalogCode}</span> · {typeLabel(d.type)}{d.dueTime ? ` · ${d.dueTime}` : ""}</p>
                      {d.description ? <p className="mt-1 text-sm text-muted">{d.description}</p> : null}
                    </div>
                    {canManage(d.catalogId) ? (<div className="flex shrink-0"><IconButton label={`Edit ${d.title}`} icon={Pencil} onClick={() => setDialog({ open: true, deadline: d })} /><IconButton label={`Delete ${d.title}`} icon={Trash2} tone="danger" onClick={() => { setErr(null); setDel(d); }} /></div>) : <Badge>Read only</Badge>}
                  </li>
                ))}
              </ul></Card>
            </section>
          ))}
        </div>
      ) : null}
      <DeadlineDialog open={dialog.open} deadline={dialog.deadline} catalog={manageable} onClose={() => setDialog({ open: false, deadline: null })} onSaved={saved} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy} error={err} title="Remove shared deadline?">
        {del ? `"${del.title}" will be removed for everyone. Students keep their own task but are told it was removed.` : ""}
      </ConfirmDialog>
    </>
  );
}
