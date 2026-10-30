"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Download, KeyRound, LogOut, Mail, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, CardHead, Dialog, Field, Input, Select, cx, useToast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/store";

/* ------------------------------------------------------------ Department */
export function DepartmentCard() {
  const { user, refresh } = useAuth();
  const { reload } = useData();
  const toast = useToast();
  const [depts, setDepts] = useState(null);
  const [value, setValue] = useState(user?.departmentId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { let live = true; api.profile.departments().then((d) => live && setDepts(d)).catch(() => live && setDepts([])); return () => { live = false; }; }, []);
  const changed = (value || null) !== (user?.departmentId ?? null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.profile.update({ departmentId: value || null }); await refresh(); await reload(); toast(value ? "Department updated" : "Left department"); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHead title="Department" action={user?.role === "dept_admin" ? <Badge tone="info">Administrator</Badge> : user?.isRep ? <Badge tone="info">Course rep</Badge> : null} />
      <div className="p-4 sm:p-5">
        {err ? <div className="mb-4"><Banner title="Could not update">{err}</Banner></div> : null}
        <Field label="Your department" htmlFor="dept" hint="Joining a department lets you receive official dates from your course reps. Changing it unlinks courses you linked to the old department.">
          <Select id="dept" value={value} onChange={(e) => setValue(e.target.value)} disabled={depts == null}>
            <option value="">{depts == null ? "Loading..." : "No department"}</option>
            {(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        {depts && depts.length === 0 ? <p className="t-small mt-2">No departments have been set up yet. An administrator creates them.</p> : null}
        <Button className="mt-4" loading={busy} disabled={!changed} onClick={save}>Save department</Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- Reminders */
const LEADS = [72, 48, 24, 6, 2, 1];
const leadLabel = (h) => (h >= 24 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`);
const toKey = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function Toggle({ id, label, hint, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className={cx("flex min-h-12 cursor-pointer items-start gap-3 py-2", disabled && "cursor-not-allowed opacity-60")}>
      <input id={id} type="checkbox" role="switch" className="mt-1 size-5 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="block text-sm font-medium">{label}</span>{hint ? <span className="t-small block">{hint}</span> : null}</span>
    </label>
  );
}

export function RemindersCard() {
  const { rawPrefs, savePrefs } = useData();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    emailReminders: !!rawPrefs?.emailReminders, pushReminders: !!rawPrefs?.pushReminders, sessionReminders: rawPrefs?.sessionReminders ?? true,
    dailyDigest: !!rawPrefs?.dailyDigest, deadlineLeadHours: rawPrefs?.deadlineLeadHours ?? [24, 2],
  }));
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  const loadStatus = useCallback(() => { api.reminders.status().then(setStatus).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(loadStatus, 0); return () => clearTimeout(t); }, [loadStatus]);

  const save = async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    await savePrefs(next);
    loadStatus();
  };
  const run = async (key, fn) => { setBusy(key); setErr(null); setNote(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(null); } };

  const enablePush = () => run("push", async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support push notifications.");
    const key = (await api.reminders.publicKey()).publicKey;
    if (!key) throw new Error("Push notifications are not set up on this server yet.");
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings and try again.");
    const reg = await withTimeout(navigator.serviceWorker.ready, 4000, "Push works in the installed or production version of the app.");
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    await api.reminders.subscribe(sub.toJSON());
    await save({ pushReminders: true });
    toast("Push notifications turned on for this device");
  });
  const disablePush = () => run("push", async () => {
    try { const reg = await withTimeout(navigator.serviceWorker.ready, 3000, "x"); const sub = await reg.pushManager.getSubscription(); if (sub) { await api.reminders.unsubscribe(sub.endpoint); await sub.unsubscribe(); } } catch { /* best effort: still turn the preference off */ }
    await save({ pushReminders: false });
    toast("Push notifications turned off");
  });
  const test = (channel) => run(`test-${channel}`, async () => { const r = await api.reminders.test(channel); setNote({ ok: r.status === "sent", text: r.message }); loadStatus(); });
  const toggleLead = (h) => run("lead", async () => {
    const cur = form.deadlineLeadHours;
    const next = cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h].sort((a, b) => b - a);
    if (!next.length || next.length > 4) throw new Error("Choose between 1 and 4 reminder times.");
    await save({ deadlineLeadHours: next });
  });

  return (
    <Card>
      <CardHead title="Reminders" />
      <div className="p-4 sm:p-5">
        {err ? <div className="mb-4"><Banner title="Could not update reminders">{err}</Banner></div> : null}
        {note ? <div className="mb-4"><Banner tone={note.ok ? "low" : "warning"}>{note.text}</Banner></div> : null}
        {status && !status.email.configured ? <div className="mb-3"><Banner tone="warning" title="Email delivery is not set up on this server">Reminders can be switched on, but no email will be sent until the server owner configures an email provider.</Banner></div> : null}
        <div className="divide-y divide-line">
          <div>
            <Toggle id="r-email" label="Email reminders" hint="Deadline reminders by email." checked={form.emailReminders} disabled={busy === "email"} onChange={(v) => run("email", () => save({ emailReminders: v }))} />
            {form.emailReminders ? <div className="pb-3 pl-8"><Button variant="secondary" icon={Mail} loading={busy === "test-email"} onClick={() => test("email")}>Send a test email</Button></div> : null}
          </div>
          <div>
            <Toggle id="r-push" label="Push notifications on this device" hint="Pop-up reminders, even when LoadWise is closed." checked={form.pushReminders} disabled={busy === "push"} onChange={(v) => (v ? enablePush() : disablePush())} />
            {form.pushReminders ? <div className="pb-3 pl-8"><p className="t-small mb-2">{status ? `${status.push.devices} device${status.push.devices === 1 ? "" : "s"} subscribed` : ""}</p><Button variant="secondary" icon={Bell} loading={busy === "test-push"} onClick={() => test("push")}>Send a test notification</Button></div> : null}
          </div>
        </div>
        {(form.emailReminders || form.pushReminders) ? (
          <div className="mt-2 border-t border-line pt-4">
            <fieldset>
              <legend className="mb-2 text-[0.8125rem] font-medium">Remind me before a deadline</legend>
              <div className="flex flex-wrap gap-2">{LEADS.map((h) => { const on = form.deadlineLeadHours.includes(h); return <button key={h} type="button" aria-pressed={on} disabled={busy === "lead"} onClick={() => toggleLead(h)} className={cx("min-h-11 rounded-md border px-3.5 text-sm font-medium md:min-h-9", on ? "border-primary-edge bg-primary text-white" : "border-line-strong bg-surface hover:border-ink")}>{leadLabel(h)}</button>; })}</div>
            </fieldset>
            <Toggle id="r-sess" label="Study session reminders" hint="15 minutes before a planned session." checked={form.sessionReminders} onChange={(v) => run("sess", () => save({ sessionReminders: v }))} />
            <Toggle id="r-digest" label="Morning summary" hint="One message around 7am with your workload and what is due." checked={form.dailyDigest} onChange={(v) => run("digest", () => save({ dailyDigest: v }))} />
          </div>
        ) : null}
        {status && (status.upcoming.length || status.recent.length) ? (
          <details className="mt-3 border-t border-line pt-3">
            <summary className="min-h-11 cursor-pointer text-sm font-medium text-primary underline underline-offset-4">Delivery log</summary>
            <ul className="t-small mt-2 flex flex-col gap-1.5">
              {status.upcoming.map((r, i) => <li key={`u${i}`}><Badge>Queued</Badge> {r.channel}: {r.title}</li>)}
              {status.recent.map((r, i) => <li key={`r${i}`}><Badge tone={r.status === "sent" ? "low" : r.status === "failed" ? "critical" : "neutral"}>{r.status === "skipped" ? `Not sent${r.detail ? `: ${r.detail.replaceAll("_", " ")}` : ""}` : r.status}</Badge> {r.channel}: {r.title}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- Account */
function PasswordForm() {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = {};
    if (!f.currentPassword) v.currentPassword = "Enter your current password";
    if (f.newPassword.length < 8) v.newPassword = "Use at least 8 characters";
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true); setErr(null);
    try { await api.auth.changePassword(f); setF({ currentPassword: "", newPassword: "" }); toast("Password changed. Other devices were signed out."); } catch (x) { setErr(x.message); setErrs(x.fields ?? {}); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
      {err ? <div className="sm:col-span-2"><Banner title="Could not change password">{err}</Banner></div> : null}
      <Field label="Current password" htmlFor="pw-cur" error={errs.currentPassword}><Input id="pw-cur" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF((x) => ({ ...x, currentPassword: e.target.value }))} aria-invalid={!!errs.currentPassword} /></Field>
      <Field label="New password" htmlFor="pw-new" error={errs.newPassword}><Input id="pw-new" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF((x) => ({ ...x, newPassword: e.target.value }))} aria-invalid={!!errs.newPassword} /></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="secondary" icon={KeyRound} loading={busy}>Change password</Button></div>
    </form>
  );
}

export function AccountCard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [delOpen, setDelOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const signOutAll = async () => { setBusy("all"); try { await api.auth.logoutAll(); await logout().catch(() => {}); router.replace("/login"); } catch (e) { toast(e.message, "error"); setBusy(null); } };
  const del = async () => {
    if (!pw) { setErr("Enter your password to confirm."); return; }
    setBusy("del"); setErr(null);
    try { await api.account.remove(pw); router.replace("/login"); setTimeout(() => location.reload(), 50); } catch (e) { setErr(e.message); setBusy(null); }
  };
  return (
    <Card>
      <CardHead title="Account" />
      <div className="flex flex-col gap-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center bg-ink font-display text-2xl text-white" aria-hidden>{(user?.name ?? "S").trim()[0]?.toUpperCase()}</span>
          <dl className="min-w-0 flex-1 basis-48 text-sm"><dt className="sr-only">Name</dt><dd className="font-medium">{user?.name}</dd><dt className="sr-only">Email</dt><dd className="t-small break-all">{user?.email}</dd></dl>
          <Button variant="secondary" icon={LogOut} onClick={async () => { await logout(); router.replace("/login"); }}>Log out</Button>
        </div>
        <section aria-label="Change password" className="border-t border-line pt-5"><h3 className="t-section mb-3">Password</h3><PasswordForm /></section>
        <section aria-label="Your data" className="border-t border-line pt-5">
          <h3 className="t-section mb-1">Your data</h3>
          <p className="t-small mb-3">Download a copy of everything LoadWise holds about you, or sign out of every device.</p>
          <div className="flex flex-wrap gap-2">
            <a href={api.account.exportUrl} download className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:border-ink md:min-h-9"><Download size={16} aria-hidden />Download my data</a>
            <Button variant="secondary" loading={busy === "all"} onClick={signOutAll}>Sign out everywhere</Button>
          </div>
        </section>
        <section aria-label="Delete account" className="border-t border-line pt-5">
          <h3 className="t-section mb-1 text-crit">Delete account</h3>
          <p className="t-small mb-3">Permanently deletes your account, courses, tasks, plans, materials and history. This cannot be undone.</p>
          <Button variant="danger" icon={Trash2} onClick={() => { setPw(""); setErr(null); setDelOpen(true); }}>Delete my account</Button>
        </section>
      </div>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account?" footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>Cancel</Button><Button variant="danger" loading={busy === "del"} onClick={del}>Delete everything</Button></>}>
        <p className="mb-3 text-sm">Everything you have added to LoadWise will be permanently deleted.</p>
        {err ? <div className="mb-3"><Banner title="Could not delete">{err}</Banner></div> : null}
        <Field label="Confirm with your password" htmlFor="del-pw"><Input id="del-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      </Dialog>
    </Card>
  );
}
