"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Banner, Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/brand";
import { LoadRail } from "@/components/viz";

const POINTS = [
  ["Every deadline in one place", "Courses, tests, assignments and exams, with the preparation each needs."],
  ["Warnings before the crunch", "What is wrong, why it matters, and what to do next."],
  ["A plan that fits your hours", "Study sessions scheduled before each deadline."],
];

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { status, login, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  useEffect(() => { if (status === "authenticated") router.replace("/dashboard"); }, [status, router]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const local = {};
    if (isRegister && !form.name.trim()) local.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = "Enter a valid email address";
    if (form.password.length < (isRegister ? 8 : 1)) local.password = isRegister ? "Use at least 8 characters" : "Enter your password";
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      await (isRegister ? register({ name: form.name.trim(), email: form.email.trim(), password: form.password }) : login({ email: form.email.trim(), password: form.password }));
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand side: desktop only, the same instrument language as the product */}
      <aside className="panel hidden flex-col justify-between p-10 lg:flex xl:p-14">
        <Logo dark />
        <div>
          <h2 className="t-display text-[3.5rem] text-balance xl:text-[4.25rem]">{isRegister ? "Start seeing your semester clearly." : "Welcome back to a clearer semester."}</h2>
          <LoadRail score={isRegister ? 34 : 72} height="3rem" className="mt-10 max-w-md" />
          <ul className="mt-10 flex max-w-md flex-col gap-5">
            {POINTS.map(([t, b]) => <li key={t} className="flex gap-3"><span className="mt-2 size-2 shrink-0 bg-signal" aria-hidden /><p className="text-sm"><span className="font-semibold">{t}.</span> <span className="text-(--panel-muted)">{b}</span></p></li>)}
          </ul>
        </div>
        <p className="t-small">A practical indicator, not a prediction of academic outcomes.</p>
      </aside>

      <main id="main" className="flex flex-col px-4 py-6 sm:px-10 lg:justify-center">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="anim-page mx-auto w-full max-w-sm">
          <p className="t-label">{isRegister ? "Get started" : "Your account"}</p>
          <h1 className="t-page mt-2 text-[2.5rem]">{isRegister ? "Create your account" : "Log in"}</h1>
          <p className="t-small mt-2 text-[0.9375rem]">{isRegister ? "Track your courses and deadlines." : "Welcome back."}</p>
          {status === "unconfigured" ? (
            <div className="mt-5"><Banner tone="warning" title="Backend not connected">Set NEXT_PUBLIC_API_BASE_URL to sign in.</Banner></div>
          ) : null}
          {error ? <div className="mt-5"><Banner title={isRegister ? "Could not create account" : "Could not log in"}>{error}</Banner></div> : null}
          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
            {isRegister ? (
              <Field label="Name" htmlFor="name" error={fields.name}>
                <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!fields.name} />
              </Field>
            ) : null}
            <Field label="Email" htmlFor="email" error={fields.email}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!fields.email} />
            </Field>
            <Field label="Password" htmlFor="password" error={fields.password} hint={isRegister ? "At least 8 characters." : undefined}>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={form.password} onChange={set("password")} aria-invalid={!!fields.password} className="pr-12" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute top-0 right-0 flex size-(--ctl-h) items-center justify-center text-muted hover:text-ink">
                  {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </Field>
            <Button type="submit" loading={busy} disabled={status === "unconfigured"} className="mt-1 min-h-12">{isRegister ? "Create account" : "Log in"}</Button>
          </form>
          <p className="t-small mt-6 text-[0.9375rem]">
            {isRegister ? "Already registered? " : "New to LoadWise? "}
            <Link href={isRegister ? "/login" : "/register"} className="font-medium text-primary underline underline-offset-4">{isRegister ? "Log in" : "Create an account"}</Link>
          </p>
          <p className="mt-8"><Link href="/" className="t-small underline underline-offset-4 hover:text-ink">Back to home</Link></p>
        </div>
      </main>
    </div>
  );
}
