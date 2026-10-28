"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, CardHead, Field, Input, PageHeader, cx, useToast } from "@/components/ui";
import { ReadyGate } from "@/components/domain";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/store";

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];

/** Live preview of weekly study capacity from the unsaved form values. */
function CapacityPreview({ hours, days }) {
  const h = Number.isFinite(Number(hours)) ? Math.max(0, Math.min(16, Number(hours))) : 0;
  const total = h * days.length;
  return (
    <section aria-label="Weekly capacity preview" className="panel rounded-lg p-5 lg:sticky lg:top-6">
      <p className="t-label">Weekly capacity</p>
      <p className="mt-3 flex items-end gap-2"><span className="t-num tnum text-[4rem]">{Math.round(total * 10) / 10}</span><span className="pb-1.5 text-sm text-panel-ink/70">hours / week</span></p>
      <div className="mt-5 flex h-24 items-end gap-1.5" role="img" aria-label={`Study hours per day: ${DAYS.map(([l, d]) => `${l} ${days.includes(d) ? h : 0}`).join(", ")}`}>
        {DAYS.map(([label, d]) => {
          const on = days.includes(d);
          return (
            <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="w-full transition-[height,background-color] duration-300" style={{ height: on ? `${Math.min(100, (h / 12) * 100)}%` : 2, minHeight: on && h > 0 ? 3 : 2, background: on ? "var(--signal)" : "var(--panel-line)" }} />
              <span className="t-label text-[0.625rem]">{label[0]}</span>
            </div>
          );
        })}
      </div>
      <p className="t-small mt-4">{days.length} study day{days.length === 1 ? "" : "s"} at {h}h each. This is the time LoadWise plans against.</p>
    </section>
  );
}

function Settings() {
  const { prefs, savePrefs } = useData();
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
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
      toast("Preferences saved");
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Your availability" title="Settings" description="Your study availability drives workload scores, warnings and the study plan." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHead title="Study preferences" />
            <div className="p-4 sm:p-5">
              {err ? <div className="mb-4"><Banner title="Could not save">{err}</Banner></div> : null}
              {msg ? <div className="mb-4"><Banner tone="low">{msg}</Banner></div> : null}
              <form onSubmit={save} noValidate className="grid gap-5 sm:grid-cols-2">
                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-[0.8125rem] font-medium">Days you can study</legend>
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {DAYS.map(([label, d]) => {
                      const on = form.availableDays.includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on} onClick={() => toggleDay(d)}
                          className={cx("min-h-12 rounded-md border text-sm font-medium transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-px", on ? "border-primary-edge bg-primary text-white shadow-key" : "border-line-strong bg-surface hover:border-ink")}>{label}</button>
                        );
                    })}
                  </div>
                </fieldset>
                <Field label="Study hours per available day" htmlFor="s-h" error={errs.dailyStudyHours}><Input id="s-h" type="number" inputMode="decimal" step="0.5" min="0" max="16" value={form.dailyStudyHours} onChange={set("dailyStudyHours")} aria-invalid={!!errs.dailyStudyHours} /></Field>
                <Field label="Preferred start time" htmlFor="s-st" error={errs.preferredStartTime}><Input id="s-st" type="time" value={form.preferredStartTime} onChange={set("preferredStartTime")} aria-invalid={!!errs.preferredStartTime} /></Field>
                <Field label="Longest session (minutes)" htmlFor="s-m" error={errs.maxSessionMinutes}><Input id="s-m" type="number" inputMode="numeric" step="5" value={form.maxSessionMinutes} onChange={set("maxSessionMinutes")} aria-invalid={!!errs.maxSessionMinutes} /></Field>
                <Field label="Break between sessions (minutes)" htmlFor="s-b" error={errs.breakMinutes}><Input id="s-b" type="number" inputMode="numeric" step="5" value={form.breakMinutes} onChange={set("breakMinutes")} aria-invalid={!!errs.breakMinutes} /></Field>
                <div className="sm:col-span-2"><Field label="Time zone" htmlFor="s-tz" hint="Deadlines are shown in this time zone."><Input id="s-tz" value={form.timezone} onChange={set("timezone")} /></Field></div>
                <div className="sm:col-span-2"><Button type="submit" loading={busy} className="w-full sm:w-auto">Save preferences</Button></div>
              </form>
            </div>
          </Card>
          <Card>
            <CardHead title="Account" />
            <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <span className="flex size-12 shrink-0 items-center justify-center bg-ink font-display text-2xl text-white" aria-hidden>{(user?.name ?? "S").trim()[0]?.toUpperCase()}</span>
              <dl className="min-w-0 flex-1 basis-48 text-sm"><dt className="sr-only">Name</dt><dd className="font-medium">{user?.name}</dd><dt className="sr-only">Email</dt><dd className="t-small break-all">{user?.email}</dd></dl>
              <Button variant="secondary" icon={LogOut} onClick={async () => { await logout(); router.replace("/login"); }}>Log out</Button>
            </div>
          </Card>
        </div>
        <CapacityPreview hours={form.dailyStudyHours} days={form.availableDays} />
      </div>
    </>
  );
}
export default function Page() { return <ReadyGate><Settings /></ReadyGate>; }
