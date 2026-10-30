"use client";
import { useState } from "react";
import { BellOff, CheckCheck } from "lucide-react";
import Link from "next/link";
import { Banner, Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { ReadyGate, WarningItem } from "@/components/domain";
import { useData } from "@/lib/store";

const GROUPS = [
  { key: "critical", label: "Critical", dot: "bg-crit" },
  { key: "warning", label: "Warnings", dot: "bg-[var(--zone-high)]" },
  { key: "info", label: "For your information", dot: "bg-[var(--zone-medium)]" },
];

function Notifications() {
  const { warningsShown, warnings, dismissWarning, readWarning, notifications, readNotification, readAllNotifications } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (id, fn, done) => { setBusy(id); setErr(null); try { await fn(); toast(done); } catch (e) { setErr(e.message); } finally { setBusy(null); } };
  const dismissed = warnings.filter((w) => w.status === "dismissed");
  const unreadNotes = notifications.filter((n) => !n.readAt).length;
  const count = (k) => warningsShown.filter((w) => w.severity === k).length;
  return (
    <>
      <PageHeader eyebrow="Early warnings" title="Notifications" description="Messages from your course reps, and early warnings generated from your real deadlines and study time. Email and push reminders are set up in Settings." />
      {err ? <div className="mb-4"><Banner title="Action failed">{err}</Banner></div> : null}
      {notifications.length > 0 ? (
        <section aria-label="Messages" className="mb-8 max-w-3xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="t-label">Messages {unreadNotes ? `(${unreadNotes} new)` : ""}</h2>
            {unreadNotes ? <Button variant="ghost" icon={CheckCheck} onClick={() => run("all", readAllNotifications, "All messages marked as read")}>Mark all read</Button> : null}
          </div>
          <Card><ul className="divide-y divide-line">
            {notifications.slice(0, 20).map((n) => (
              <li key={n.id} className={`flex items-start gap-3 p-3 sm:px-4 ${n.readAt ? "opacity-70" : ""}`}>
                <span className={`mt-2 size-2 shrink-0 ${n.readAt ? "bg-line-strong" : "bg-primary"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-sm text-muted">{n.body}</p> : null}
                  <p className="t-small tnum mt-1">{new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{n.link ? <> · <Link href={n.link} onClick={() => !n.readAt && readNotification(n.id).catch(() => {})} className="font-medium text-primary underline underline-offset-4">Open</Link></> : null}</p>
                </div>
                {!n.readAt ? <Button variant="ghost" loading={busy === `n${n.id}`} onClick={() => run(`n${n.id}`, () => readNotification(n.id), "Marked as read")}>Mark read</Button> : null}
              </li>
            ))}
          </ul></Card>
        </section>
      ) : null}
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
