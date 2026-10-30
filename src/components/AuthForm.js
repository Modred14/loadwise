// src/components/AuthForm.js
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { passwordProblem } from "@/lib/password";
import { Banner, Button, Field, Input, Select } from "@/components/ui";
import { AuthHeading, AuthLayout } from "@/components/AuthLayout";
import { PasswordInput, PasswordStrength } from "@/components/PasswordField";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_ORDER = ["name", "email", "password", "confirm"];

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { status, login, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", departmentId: "" });
  const [depts, setDepts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [confirmTouched, setConfirmTouched] = useState(false);

  useEffect(() => { if (status === "authenticated") router.replace("/dashboard"); }, [status, router]);
  useEffect(() => {
    if (!isRegister) return;
    let live = true;
    api.profile.departments().then((d) => live && setDepts(d)).catch(() => {}); // optional: registration works without it
    return () => { live = false; };
  }, [isRegister]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    // Editing a field clears its own error (and the confirm error when the password it must match changes).
    setFields((f) => (f[key] || (key === "password" && f.confirm) ? { ...f, [key]: undefined, ...(key === "password" ? { confirm: undefined } : null) } : f));
  };

  const validate = () => {
    const e = {};
    if (isRegister && !form.name.trim()) e.name = "Enter your name";
    if (!EMAIL.test(form.email.trim())) e.email = "Enter a valid email address";
    if (isRegister) {
      const problem = passwordProblem(form.password);
      if (problem) e.password = problem;
      if (!form.confirm) e.confirm = "Confirm your password";
      else if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    } else if (!form.password) {
      e.password = "Enter your password";
    }
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const local = validate();
    setFields(local);
    setError(null);
    const first = FIELD_ORDER.find((k) => local[k]);
    if (first) { document.getElementById(first)?.focus(); return; }
    setBusy(true);
    try {
      const email = form.email.trim();
      await (isRegister
        ? register({ name: form.name.trim(), email, password: form.password, ...(form.departmentId ? { departmentId: form.departmentId } : {}) })
        : login({ email, password: form.password }));
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  };

  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const confirmError = fields.confirm ?? (confirmTouched && mismatch ? "Passwords do not match" : undefined);
  const confirmMatches = form.confirm.length > 0 && !mismatch;

  return (
    <AuthLayout headline={isRegister ? "Know your hardest week before it arrives." : "Your deadlines, in order."}>
      <AuthHeading
        title={isRegister ? "Create your account" : "Welcome back"}
        lead={isRegister ? "Add your courses and see how heavy each week really is." : "Log in to see what is due and what to do first."}
      />

      {status === "unconfigured" ? (
        <div className="mt-6"><Banner tone="warning" title="Cannot find the API">NEXT_PUBLIC_API_BASE_URL is set to an empty value. Remove it so the app uses its own /api.</Banner></div>
      ) : null}
      {error ? <div className="mt-6"><Banner title={isRegister ? "Could not create your account" : "Could not log in"}>{error}</Banner></div> : null}

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        {isRegister ? (
          <Field label="Full name" htmlFor="name" error={fields.name}>
            <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!fields.name} className="min-h-12" />
          </Field>
        ) : null}

        <Field label="Email address" htmlFor="email" error={fields.email}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@university.edu" value={form.email} onChange={set("email")} aria-invalid={!!fields.email} className="min-h-12" />
        </Field>

        <Field label="Password" htmlFor="password" error={fields.password}>
          <PasswordInput id="password" autoComplete={isRegister ? "new-password" : "current-password"} value={form.password} onChange={set("password")} aria-invalid={!!fields.password} aria-describedby={isRegister ? "password-rules" : undefined} />
        </Field>

        {isRegister ? (
          <>
            <PasswordStrength id="password-rules" password={form.password} />
            <Field
              label="Confirm password"
              htmlFor="confirm"
              error={confirmError}
              hint={confirmMatches ? <span className="inline-flex items-center gap-1.5 font-medium text-primary"><Check size={14} aria-hidden />Passwords match</span> : undefined}
            >
              <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} onBlur={() => setConfirmTouched(true)} aria-invalid={!!confirmError} />
            </Field>
            {depts.length ? (
              <Field label="Department (optional)" htmlFor="departmentId" hint="Lets you receive official dates from your course reps. You can change it later in Settings.">
                <Select id="departmentId" value={form.departmentId} onChange={set("departmentId")} className="min-h-12"><option value="">Not now</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              </Field>
            ) : null}
          </>
        ) : (
          <p className="-mt-2 text-right"><Link href="/forgot-password" className="t-small font-medium text-primary underline underline-offset-4">Forgot password?</Link></p>
        )}

        <Button type="submit" loading={busy} disabled={status === "unconfigured"} className="mt-1 min-h-12 w-full text-[0.9375rem]">
          {isRegister ? "Create account" : "Log in"}
        </Button>
      </form>

      <p className="mt-8 text-[0.9375rem] text-muted">
        {isRegister ? "Already have an account? " : "New to LoadWise? "}
        <Link href={isRegister ? "/login" : "/register"} className="font-medium text-primary underline underline-offset-4">{isRegister ? "Log in" : "Create an account"}</Link>
      </p>
      <p className="mt-4"><Link href="/" className="t-small underline underline-offset-4 hover:text-ink">Back to home</Link></p>
    </AuthLayout>
  );
}