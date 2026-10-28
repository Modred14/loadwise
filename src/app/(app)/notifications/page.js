"use client";
import { useState } from "react";
import { BellOff } from "lucide-react";
import { Banner, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { ReadyGate, WarningItem } from "@/components/domain";
import { useData } from "@/lib/store";

const GROUPS = [
  { key: "critical", label: "Critical", dot: "bg-crit" },
  { key: "warning", label: "Warnings", dot: "bg-[var(--zone-high)]" },
  { key: "info", label: "For your information", dot: "bg-primary" },
];

function Notifications() {
  const { warningsShown, warnings, dismissWarning, readWarning } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (id, fn, done) => { setBusy(id); setErr(null); try { await fn(); toast(done); } catch (e) { setErr(e.message); } finally { setBusy(null); } };
  const dismissed = warnings.filter((w) => w.status === "dismissed");
  const count = (k) => warningsShown.filter((w) => w.severity === k).length;
  return (
    <>
      <PageHeader eyebrow="Early warnings" title="Notifications" description="Early warnings generated from your real deadlines and study time. In-app only: no email or push messages are sent." />
      {err ? <div className="mb-4"><Banner title="Action failed">{err}</Banner></div> : null}
      {warningsShown.length === 0 ? (
        <Card><EmptyState icon={BellOff} title="No active warnings">Warnings appear here when deadlines cluster, an exam lacks preparation time, or a task becomes overdue.</EmptyState></Card>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-3 divide-x divide-line border-y border-line-strong py-4">
            {GROUPS.map((g, i) => (
              <div key={g.key} className={`flex flex-col-reverse ${i === 0 ? "pr-4" : "px-4"}`}>
                <dt className="t-label mt-2 flex items-center gap-2"><span className={`size-2 ${g.dot}`} aria-hidden />{g.label}</dt>
                <dd className="t-num tnum text-[2.5rem] sm:text-[3.25rem]">{count(g.key)}</dd>
              </div>
            ))}
          </dl>
          <div className="stagger flex max-w-3xl flex-col gap-8">
            {GROUPS.filter((g) => count(g.key) > 0).map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h2 className="t-label mb-3 flex items-center gap-2"><span className={`size-2 ${g.dot}`} aria-hidden />{g.label}</h2>
                <div className="flex flex-col gap-3">
                  {warningsShown.filter((w) => w.severity === g.key).map((w) => (
                    <WarningItem key={w.key} w={w} busy={busy} onRead={(x) => run(`r${x.id}`, () => readWarning(x.id), "Marked as read")} onDismiss={(x) => run(`d${x.id}`, () => dismissWarning(x.id), "Warning dismissed")} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {dismissed.length ? (
        <details className="group mt-8 max-w-3xl border-t border-line pt-4">
          <summary className="inline-flex min-h-(--ctl-h) items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">Dismissed ({dismissed.length})</summary>
          <div className="mt-3 flex flex-col gap-3 opacity-75">{dismissed.map((w) => <WarningItem key={w.key} w={w} />)}</div>
        </details>
      ) : null}
    </>
  );
}
export default function Page() { return <ReadyGate skeleton="list"><Notifications /></ReadyGate>; }
