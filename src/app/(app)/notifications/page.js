"use client";
import { useState } from "react";
import { BellOff } from "lucide-react";
import { Banner, Card, EmptyState, PageHeader } from "@/components/ui";
import { ReadyGate, WarningItem } from "@/components/domain";
import { useData } from "@/lib/store";

function Notifications() {
  const { warningsShown, warnings, dismissWarning, readWarning } = useData();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (id, fn) => { setBusy(id); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(null); } };
  const dismissed = warnings.filter((w) => w.status === "dismissed");
  return (
    <>
      <PageHeader title="Notifications" description="Early warnings generated from your real deadlines and study time. In-app only: no email or push messages are sent." />
      {err ? <div className="mb-4"><Banner title="Action failed">{err}</Banner></div> : null}
      {warningsShown.length === 0 ? (
        <Card><EmptyState icon={BellOff} title="No active warnings">Warnings appear here when deadlines cluster, an exam lacks preparation time, or a task becomes overdue.</EmptyState></Card>
      ) : (
        <div className="flex flex-col gap-3">{warningsShown.map((w) => <WarningItem key={w.key} w={w} busy={busy} onRead={(x) => run(`r${x.id}`, () => readWarning(x.id))} onDismiss={(x) => run(`d${x.id}`, () => dismissWarning(x.id))} />)}</div>
      )}
      {dismissed.length ? (
        <details className="mt-6"><summary className="cursor-pointer text-sm font-medium text-primary">Dismissed ({dismissed.length})</summary>
          <div className="mt-3 flex flex-col gap-3 opacity-80">{dismissed.map((w) => <WarningItem key={w.key} w={w} />)}</div>
        </details>
      ) : null}
    </>
  );
}
export default function Page() { return <ReadyGate><Notifications /></ReadyGate>; }
