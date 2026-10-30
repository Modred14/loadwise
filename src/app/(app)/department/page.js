"use client";
import { useCallback, useEffect, useState } from "react";
import { Landmark, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Badge, Banner, Button, Card, CardHead, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Spinner, useToast } from "@/components/ui";
import TrendChart from "@/components/trend";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDayLong } from "@/lib/format";

const hidden = <span className="t-small" title="Hidden to protect privacy">fewer than 5</span>;

function Insights() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const load = useCallback(async () => {
    try { setState({ status: "ready", data: await api.department.insights(), error: null }); } catch (e) { setState({ status: "error", data: null, error: e.message }); }
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  if (state.status === "loading") return <Spinner label="Loading insights" />;
  if (state.status === "error") return <Banner title="Could not load insights" action={<Button variant="secondary" onClick={load}>Retry</Button>}>{state.error}</Banner>;
  const d = state.data;
  const privacy = <p className="t-small mt-6 flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />Every figure is an aggregate. Groups smaller than {d.minCohort} students are hidden, and hidden figures are suppressed together so they cannot be worked out by subtraction. No names, emails or individual tasks are ever shown.</p>;
  if (d.suppressed) return <Card><EmptyState icon={ShieldCheck} title="Not enough students yet">{d.message}</EmptyState></Card>;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHead title="Current workload across the department" />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div><p className="t-label">Students using LoadWise</p><p className="t-num tnum text-[2.5rem]">{d.students}</p></div>
          <div><p className="t-label">With active tasks</p><p className="t-num tnum text-[2.5rem]">{d.distribution?.activeStudents ?? hidden}</p></div>
          <div><p className="t-label">Average workload score</p><p className="t-num tnum text-[2.5rem]">{d.distribution ? d.distribution.averageScore : hidden}</p></div>
        </div>
        {d.distribution ? (
          <div className="border-t border-line p-4">
            {d.distribution.manageable == null ? <p className="t-small">{d.distribution.note}</p> : (
              <>
                <div className="flex h-3 overflow-hidden" role="img" aria-label={`${d.distribution.manageable} students with a manageable load, ${d.distribution.heavy} with a heavy load`}>
                  <span style={{ width: `${(d.distribution.manageable / d.distribution.activeStudents) * 100}%`, background: "var(--zone-low)" }} />
                  <span style={{ width: `${(d.distribution.heavy / d.distribution.activeStudents) * 100}%`, background: "var(--zone-high)" }} />
                </div>
                <p className="t-small tnum mt-2">{d.distribution.manageable} manageable (Low or Medium) · {d.distribution.heavy} heavy (High or Critical)</p>
              </>
            )}
          </div>
        ) : null}
      </Card>
      {d.trend.length ? <Card><CardHead title="Average workload, last 30 days" /><div className="p-4"><TrendChart points={d.trend.map((t) => ({ day: t.day, score: t.averageScore }))} label="Department average workload score" /></div></Card> : null}
      <Card>
        <CardHead title="Exam and test clashes in the next 3 weeks" />
        {d.clashes.length === 0 ? <p className="t-small p-4">No two major assessments fall on the same day.</p> : (
          <ul className="divide-y divide-line">{d.clashes.map((c) => (
            <li key={c.date} className="p-3 sm:px-4">
              <p className="font-medium">{formatDayLong(c.date)}</p>
              <p className="t-small">{c.items.map((i) => `${i.code}: ${i.title}`).join(" · ")}</p>
              <p className="t-small mt-1">Students taking more than one of these: {c.studentsInBoth ?? hidden}</p>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card>
        <CardHead title="Courses" />
        <ul className="divide-y divide-line">{d.catalog.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-3 sm:px-4">
            <p className="min-w-0 flex-1 basis-48"><span className="font-medium">{c.code}</span> <span className="text-muted">{c.name}</span></p>
            {c.suppressed ? <span className="t-small">{hidden} enrolled</span> : (
              <p className="t-small tnum"><span className="text-ink">{c.enrolled}</span> enrolled · avg course score {c.averageCourseScore ?? "hidden"} · avg {c.averageRemainingHours ?? "hidden"}h to prepare</p>
            )}
          </li>
        ))}{d.catalog.length === 0 ? <li className="t-small p-4">Add courses on the Courses and reps tab.</li> : null}</ul>
      </Card>
      {privacy}
    </div>
  );
}

function RepsDialog({ course, onClose }) {
  const toast = useToast();
  const [reps, setReps] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => { try { setReps(await api.catalog.reps(course.id)); } catch (e) { setErr(e.message); } }, [course.id]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  const add = async () => {
    if (busy || !email.trim()) return;
    setBusy(true); setErr(null);
    try { await api.catalog.addRep(course.id, email.trim()); setEmail(""); toast("Course rep added"); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (r) => { setErr(null); try { await api.catalog.removeRep(course.id, r.userId); toast("Course rep removed"); await load(); } catch (e) { setErr(e.message); } };
  return (
    <Dialog open onClose={onClose} title={`Course reps for ${course.code}`}>
      {err ? <div className="mb-3"><Banner title="Could not complete the action">{err}</Banner></div> : null}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex items-end gap-2">
        <div className="flex-1"><Field label="Add by email" htmlFor="rep-email" hint="They must already have a LoadWise account in your department."><Input id="rep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
        <Button type="submit" icon={UserPlus} loading={busy}>Add</Button>
      </form>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {reps == null ? <li className="p-3"><Spinner label="Loading" /></li> : reps.length === 0 ? <li className="t-small p-3">No course reps yet.</li> : reps.map((r) => (
          <li key={r.userId} className="flex items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p><p className="t-small truncate">{r.email}</p></div><IconButton label={`Remove ${r.name}`} icon={Trash2} tone="danger" onClick={() => remove(r)} /></li>
        ))}
      </ul>
    </Dialog>
  );
}

function CatalogTab() {
  const toast = useToast();
  const [state, setState] = useState({ status: "loading", items: [], error: null });
  const [form, setForm] = useState({ code: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [reps, setReps] = useState(null);
  const [del, setDel] = useState(null);
  const load = useCallback(async () => { try { setState({ status: "ready", items: await api.catalog.list(), error: null }); } catch (e) { setState({ status: "error", items: [], error: e.message }); } }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  const add = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.code.trim() || !form.name.trim()) { setErr("Enter both a course code and a name."); return; }
    setBusy(true); setErr(null);
    try { await api.catalog.create({ code: form.code.trim(), name: form.name.trim() }); setForm({ code: "", name: "" }); toast("Course added"); await load(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const confirmDelete = async () => { setBusy(true); try { await api.catalog.remove(del.id); setDel(null); toast("Course removed"); await load(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card>
        <CardHead title="Add a department course" />
        <form onSubmit={add} noValidate className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <Field label="Code" htmlFor="cat-code"><Input id="cat-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} maxLength={20} /></Field>
          <Field label="Name" htmlFor="cat-name"><Input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={160} /></Field>
          <Button type="submit" icon={Plus} loading={busy}>Add course</Button>
        </form>
        {err ? <div className="px-4 pb-4"><Banner title="Could not add the course">{err}</Banner></div> : null}
      </Card>
      {state.status === "loading" ? <Spinner label="Loading courses" /> : null}
      {state.status === "error" ? <Banner title="Could not load courses" action={<Button variant="secondary" onClick={load}>Retry</Button>}>{state.error}</Banner> : null}
      {state.status === "ready" && state.items.length ? (
        <Card><ul className="divide-y divide-line">{state.items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
            <p className="min-w-0 flex-1 basis-48"><span className="font-medium">{c.code}</span> <span className="text-muted">{c.name}</span></p>
            <Button variant="secondary" icon={UserPlus} onClick={() => setReps(c)}>Course reps</Button>
            <IconButton label={`Delete ${c.code}`} icon={Trash2} tone="danger" onClick={() => setDel(c)} />
          </li>
        ))}</ul></Card>
      ) : null}
      {reps ? <RepsDialog course={reps} onClose={() => setReps(null)} /> : null}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy} title="Delete department course?">{del ? `${del.code} and its shared deadlines will be removed. Students keep their own copies of their courses and tasks.` : ""}</ConfirmDialog>
    </div>
  );
}

export default function Page() {
  const { user } = useAuth();
  const [tab, setTab] = useState("insights");
  if (user?.role !== "dept_admin" || !user?.departmentId) {
    return (<><PageHeader eyebrow="Administration" title="Department" /><Card><EmptyState icon={Landmark} title="Administrators only">This area is for department administrators. Ask your administrator to be made a course rep instead.</EmptyState></Card></>);
  }
  return (
    <>
      <PageHeader eyebrow={user.departmentName} title="Department" description="Anonymous workload insights, and the courses and representatives that publish shared dates." />
      <div className="mb-5"><Segmented label="Department sections" value={tab} onChange={setTab} options={[{ value: "insights", label: "Insights" }, { value: "catalog", label: "Courses and reps" }]} /></div>
      {tab === "insights" ? <Insights /> : <CatalogTab />}
    </>
  );
}
