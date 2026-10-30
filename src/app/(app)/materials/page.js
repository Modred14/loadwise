"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileImage, FileText, FolderOpen, Link2, Pencil, Plus, Presentation, Search, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select, Spinner, useToast } from "@/components/ui";
import { ReadyGate } from "@/components/domain";
import MaterialDialog, { Snippet, formatBytes } from "@/components/materials";
import { api } from "@/lib/api/client";
import { useData } from "@/lib/store";

const KIND_ICON = (mime) => (mime === "application/pdf" ? FileText : mime.startsWith("image/") ? FileImage : mime.includes("presentation") ? Presentation : FileText);
const inlineable = (m) => m.mime === "application/pdf" || m.mime.startsWith("image/");

function Materials() {
  const { courses, tasks } = useData();
  const toast = useToast();
  const [f, setF] = useState({ q: "", courseId: "", kind: "", tag: "" });
  const [state, setState] = useState({ items: [], next: null, status: "loading", error: null });
  const [usage, setUsage] = useState(null);
  const [dialog, setDialog] = useState({ open: false, material: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async (filters, cursor) => {
    const mine = ++seq.current; // ignore out-of-order responses while typing
    try {
      const res = await api.materials.list({ ...filters, cursor, limit: 30 });
      if (mine !== seq.current) return;
      setState((s) => ({ items: cursor ? [...s.items, ...res.items] : res.items, next: res.nextCursor, status: "ready", error: null }));
    } catch (e) {
      if (mine === seq.current) setState((s) => ({ ...s, status: "error", error: e.message }));
    }
  }, []);
  const loadUsage = useCallback(() => { api.materials.usage().then(setUsage).catch(() => {}); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(f), f.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [f, load]);
  useEffect(() => { const t = setTimeout(loadUsage, 0); return () => clearTimeout(t); }, [loadUsage]);

  const courseOf = (id) => courses.find((c) => c.id === id);
  const taskTitle = (id) => tasks.find((t) => t.id === id)?.title;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const filtered = f.q || f.courseId || f.kind || f.tag;

  const confirmDelete = async () => {
    setBusy(true); setErr(null);
    try { await api.materials.remove(del.id); setDel(null); toast("Material deleted"); load(f); loadUsage(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const saved = (m, created) => { toast(created ? "Material uploaded" : "Material updated"); load(f); loadUsage(); return m; };

  return (
    <>
      <PageHeader eyebrow="Your library" title="Study materials" description="Upload notes, slides and past papers, search inside them, and link them to the tasks you are preparing for."
        actions={<Button icon={Plus} onClick={() => setDialog({ open: true, material: null })}>Upload</Button>} />
      <Card className="mb-4 grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
        <div className="relative col-span-2">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search materials" placeholder="Search titles, notes and file contents" className="pl-9" value={f.q} onChange={set("q")} />
        </div>
        <Select aria-label="Filter by course" value={f.courseId} onChange={set("courseId")}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select>
        <Select aria-label="Filter by type" value={f.kind} onChange={set("kind")}><option value="">All types</option><option value="pdf">PDF</option><option value="image">Images</option><option value="text">Text and Markdown</option><option value="document">Word and PowerPoint</option></Select>
      </Card>
      {usage ? <p className="t-small tnum mb-3">{usage.files} file{usage.files === 1 ? "" : "s"}, {formatBytes(usage.bytes)} of {formatBytes(usage.maxBytes)} used</p> : null}
      {state.status === "error" ? <Banner title="Could not load materials" action={<Button variant="secondary" onClick={() => load(f)}>Retry</Button>}>{state.error}</Banner> : null}
      {state.status === "loading" ? <Spinner label="Loading materials" /> : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <Card>
          {filtered ? <EmptyState icon={Search} title="No materials match" action={<Button variant="secondary" onClick={() => setF({ q: "", courseId: "", kind: "", tag: "" })}>Clear filters</Button>}>Try a different word, or search part of a word.</EmptyState>
            : <EmptyState icon={FolderOpen} title="No study materials yet" action={<Button onClick={() => setDialog({ open: true, material: null })}>Upload your first file</Button>}>Add lecture notes or past papers. Text inside PDFs, TXT and Markdown files is searchable, and each file can be linked to the tasks it helps with.</EmptyState>}
        </Card>
      ) : null}
      {state.items.length > 0 ? (
        <Card>
          <ul className="divide-y divide-line">
            {state.items.map((m) => {
              const Icon = KIND_ICON(m.mime);
              const c = courseOf(m.courseId);
              return (
                <li key={m.id} className="flex flex-wrap items-start gap-3 p-3 sm:px-4">
                  <Icon size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="break-words font-medium">{m.title}</p>
                    <p className="t-small tnum break-all">{m.filename} · {formatBytes(m.sizeBytes)}{c ? ` · ${c.code}` : ""}{m.textExtracted ? "" : " · not searchable inside"}</p>
                    {m.snippet ? <p className="mt-1 text-sm text-muted"><Snippet text={m.snippet} /></p> : null}
                    {m.tags.length || m.taskIds.length ? (
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                        {m.taskIds.map((id) => taskTitle(id) ? <Badge key={id} tone="info"><Link2 size={11} aria-hidden />{taskTitle(id)}</Badge> : null)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {inlineable(m) ? <a href={api.materials.fileUrl(m.id, true)} target="_blank" rel="noopener" aria-label={`Preview ${m.title}`} className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2 md:size-9"><Eye size={16} aria-hidden /></a> : null}
                    <a href={api.materials.fileUrl(m.id)} download aria-label={`Download ${m.title}`} className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2 md:size-9"><Download size={16} aria-hidden /></a>
                    <IconButton label={`Edit ${m.title}`} icon={Pencil} onClick={() => setDialog({ open: true, material: m })} />
                    <IconButton label={`Delete ${m.title}`} icon={Trash2} tone="danger" onClick={() => { setErr(null); setDel(m); }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {state.next ? <div className="border-t border-line p-3"><Button variant="secondary" onClick={() => load(f, state.next)}>Show more</Button></div> : null}
        </Card>
      ) : null}
      <MaterialDialog open={dialog.open} material={dialog.material} onClose={() => setDialog({ open: false, material: null })} onSaved={saved} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy} error={err} title="Delete material?">
        {del ? `"${del.title}" will be permanently deleted from your library.` : ""}
      </ConfirmDialog>
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="list"><Materials /></ReadyGate>; }
