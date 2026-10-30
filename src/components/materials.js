"use client";
import { useState } from "react";
import { Banner, Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useData } from "@/lib/store";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,.markdown,.docx,.pptx";
export const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 102.4) / 10} KB` : `${Math.round(n / 104857.6) / 10} MB`);

/** Renders a search snippet where the server wrapped matches in « ». Plain text only, never HTML. */
export function Snippet({ text }) {
  return <>{String(text).split(/(«[^»]*»)/).map((part, i) => (part.startsWith("«") ? <mark key={i} className="bg-[var(--signal)]/40 px-0.5 text-ink">{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>))}</>;
}

function TaskPicker({ tasks, value, onChange }) {
  if (!tasks.length) return <p className="t-small">No open tasks to link yet.</p>;
  return (
    <ul className="max-h-40 overflow-y-auto border border-line-strong">
      {tasks.map((t) => {
        const on = value.includes(t.id);
        return (
          <li key={t.id} className="border-b border-line last:border-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-surface-2">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="t-small tnum shrink-0">{t.dueDate}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Upload (no `material`) or edit (`material`) dialog. Mounted only while open so the form always starts fresh. */
export default function MaterialDialog({ open, onClose, material, onSaved }) {
  return open ? <Inner onClose={onClose} material={material} onSaved={onSaved} /> : null;
}

function Inner({ onClose, material, onSaved }) {
  const { courses, tasks } = useData();
  const openTasks = tasks.filter((t) => t.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 60);
  const [form, setForm] = useState(() => ({ title: material?.title ?? "", notes: material?.notes ?? "", tags: (material?.tags ?? []).join(", "), courseId: material?.courseId ?? "", taskIds: material?.taskIds ?? [] }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, "") }));
    setErrs((x) => ({ ...x, file: f && f.size > MAX_FILE_BYTES ? `Files can be at most ${MAX_FILE_BYTES / 1048576} MB` : undefined }));
  };

  const submit = async () => {
    if (busy) return;
    const v = {};
    if (!material && !file) v.file = "Choose a file";
    if (file && file.size > MAX_FILE_BYTES) v.file = `Files can be at most ${MAX_FILE_BYTES / 1048576} MB`;
    if (!form.title.trim()) v.title = "Enter a title";
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError(null);
    try {
      let saved;
      if (material) {
        saved = await api.materials.update(material.id, { title: form.title.trim(), notes: form.notes.trim(), tags: form.tags, courseId: form.courseId || null });
        saved = await api.materials.setTasks(material.id, form.taskIds);
      } else {
        const fd = new FormData();
        fd.set("file", file); fd.set("title", form.title.trim()); fd.set("notes", form.notes.trim()); fd.set("tags", form.tags);
        if (form.courseId) fd.set("courseId", form.courseId);
        if (form.taskIds.length) fd.set("taskIds", form.taskIds.join(","));
        saved = await api.materials.upload(fd);
      }
      onSaved(saved, !material);
      onClose();
    } catch (e) {
      setError(e.message);
      if (e.fields) setErrs(e.fields);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={material ? "Edit material" : "Upload study material"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{material ? "Save changes" : "Upload"}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate className="flex flex-col gap-4">
        {error ? <Banner title={material ? "Could not save" : "Upload failed"}>{error}</Banner> : null}
        {!material ? (
          <Field label="File" htmlFor="m-file" error={errs.file} hint="PDF, PNG, JPG, TXT, Markdown, DOCX or PPTX, up to 4 MB. Text in PDFs, TXT and Markdown files becomes searchable.">
            <Input id="m-file" type="file" accept={ACCEPT} onChange={pick} aria-invalid={!!errs.file} className="py-2" />
          </Field>
        ) : null}
        <Field label="Title" htmlFor="m-title" error={errs.title}><Input id="m-title" value={form.title} onChange={set("title")} maxLength={160} aria-invalid={!!errs.title} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course (optional)" htmlFor="m-course" error={errs.courseId}>
            <Select id="m-course" value={form.courseId} onChange={set("courseId")}><option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.name}</option>)}</Select>
          </Field>
          <Field label="Tags (comma separated)" htmlFor="m-tags" error={errs.tags}><Input id="m-tags" value={form.tags} onChange={set("tags")} placeholder="chapter 4, revision" /></Field>
        </div>
        <Field label="Notes (optional, searchable)" htmlFor="m-notes" error={errs.notes}><Textarea id="m-notes" value={form.notes} onChange={set("notes")} maxLength={2000} /></Field>
        <div>
          <p className="mb-1 text-[0.8125rem] font-medium">Use for these tasks</p>
          <TaskPicker tasks={openTasks} value={form.taskIds} onChange={(taskIds) => setForm((f) => ({ ...f, taskIds }))} />
          <p className="t-small mt-1">Linked materials show up next to the study sessions for that task, even after you regenerate your plan.</p>
          {errs.taskIds ? <p role="alert" className="mt-1 text-sm text-crit">{errs.taskIds}</p> : null}
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
