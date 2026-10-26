"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ReadyGate } from "@/components/domain";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/store";

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];

function Settings() {
  const { prefs, savePrefs } = useData();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ ...prefs, timezone: prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => { setMsg(null); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const toggleDay = (d) => { setMsg(null); setForm((f) => ({ ...f, availableDays: f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d] })); };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = {};
    const h = Number(form.dailyStudyHours);
    if (!Number.isFinite(h) || h < 0 || h > 16) v.dailyStudyHours = "Enter 0 to 16 hours";
    if (!(Number(form.maxSessionMinutes) >= 30 && Number(form.maxSessionMinutes) <= 240)) v.maxSessionMinutes = "Enter 30 to 240 minutes";
    if (!(Number(form.breakMinutes) >= 0 && Number(form.breakMinutes) <= 60)) v.breakMinutes = "Enter 0 to 60 minutes";
    if (!form.preferredStartTime) v.preferredStartTime = "Choose a start time";
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await savePrefs({ dailyStudyHours: h, availableDays: form.availableDays, maxSessionMinutes: Number(form.maxSessionMinutes), breakMinutes: Number(form.breakMinutes), preferredStartTime: form.preferredStartTime, timezone: form.timezone });
      setMsg("Preferences saved. Regenerate your plan in the planner to apply them.");
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your study availability drives workload scores, warnings and the study plan." />
      <div className="grid max-w-3xl gap-5">
        <Card className="p-4 sm:p-5">
          <h2 className="t-section">Study preferences</h2>
          {err ? <div className="mt-3"><Banner title="Could not save">{err}</Banner></div> : null}
          {msg ? <div className="mt-3"><Banner tone="low">{msg}</Banner></div> : null}
          <form onSubmit={save} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Study hours per available day" htmlFor="s-h" error={errs.dailyStudyHours}><Input id="s-h" type="number" inputMode="decimal" step="0.5" min="0" max="16" value={form.dailyStudyHours} onChange={set("dailyStudyHours")} /></Field>
            <Field label="Preferred start time" htmlFor="s-st" error={errs.preferredStartTime}><Input id="s-st" type="time" value={form.preferredStartTime} onChange={set("preferredStartTime")} /></Field>
            <Field label="Longest session (minutes)" htmlFor="s-m" error={errs.maxSessionMinutes}><Input id="s-m" type="number" inputMode="numeric" step="5" value={form.maxSessionMinutes} onChange={set("maxSessionMinutes")} /></Field>
            <Field label="Break between sessions (minutes)" htmlFor="s-b" error={errs.breakMinutes}><Input id="s-b" type="number" inputMode="numeric" step="5" value={form.breakMinutes} onChange={set("breakMinutes")} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Days you can study</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(([label, d]) => (
                  <button key={d} type="button" aria-pressed={form.availableDays.includes(d)} onClick={() => toggleDay(d)}
                    className={`min-h-11 min-w-14 rounded-md border px-3 text-sm font-medium transition-colors md:min-h-9 ${form.availableDays.includes(d) ? "border-primary bg-primary text-white" : "border-line bg-surface hover:bg-surface-2"}`}>{label}</button>
                ))}
              </div>
            </fieldset>
            <Field label="Time zone" htmlFor="s-tz" hint="Deadlines are shown in this time zone."><Input id="s-tz" value={form.timezone} onChange={set("timezone")} /></Field>
            <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save preferences</Button></div>
          </form>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="t-section">Account</h2>
          <dl className="mt-3 text-sm"><dt className="t-small">Name</dt><dd className="mb-2 font-medium">{user?.name}</dd><dt className="t-small">Email</dt><dd className="font-medium break-all">{user?.email}</dd></dl>
          <Button variant="secondary" icon={LogOut} className="mt-4" onClick={async () => { await logout(); router.replace("/login"); }}>Log out</Button>
        </Card>
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate><Settings /></ReadyGate>; }
