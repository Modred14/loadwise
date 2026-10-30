// src/components/PasswordRecovery.js
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { AuthHeading, AuthLayout } from "@/components/AuthLayout";
import { PasswordInput, PasswordStrength } from "@/components/PasswordField";
import { api } from "@/lib/api/client";
import { passwordProblem } from "@/lib/password";

const HEADLINE = "Back in, with a stronger lock.";

function Shell({ title, lead, children }) {
  return (
    <AuthLayout headline={HEADLINE}>
      <AuthHeading title={title} lead={lead} />
      {children}
      <p className="mt-8"><Link href="/login" className="t-small underline underline-offset-4 hover:text-ink">Back to log in</Link></p>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("Enter a valid email address."); return; }
    setBusy(true); setErr(null);
    try { await api.auth.forgot(email.trim()); setDone(true); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (done) return (
    <Shell title="Check your email">
      <div className="mt-6"><Banner tone="info">If an account exists for {email}, we have sent a link to reset the password. It is valid for one hour.</Banner></div>
    </Shell>
  );
  return (
    <Shell title="Reset your password" lead="Enter your email and we will send you a link to choose a new password.">
      {err ? <div className="mt-6"><Banner title="Could not send the link">{err}</Banner></div> : null}
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <Field label="Email address" htmlFor="fp-email">
          <Input id="fp-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-12" />
        </Field>
        <Button type="submit" loading={busy} className="min-h-12 w-full text-[0.9375rem]">Send reset link</Button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const router = useRouter();
  const [token, setToken] = useState(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setToken(new URLSearchParams(window.location.search).get("token") ?? ""), 0); return () => clearTimeout(t); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = {};
    const problem = passwordProblem(password);
    if (problem) v.password = problem;
    if (!confirm) v.confirm = "Confirm your password";
    else if (confirm !== password) v.confirm = "Passwords do not match";
    setErrs(v);
    if (v.password || v.confirm) { document.getElementById(v.password ? "rp-pw" : "rp-confirm")?.focus(); return; }
    setBusy(true); setErr(null);
    try { await api.auth.reset({ token, password }); setDone(true); setTimeout(() => router.replace("/login"), 1800); } catch (x) { setErr(x.message); setErrs(x.fields ?? {}); } finally { setBusy(false); }
  };

  if (token === undefined) return <Shell title="Choose a new password" />;
  if (!token) return <Shell title="Link not valid"><div className="mt-6"><Banner title="This reset link is incomplete">Open the link from your email again, or request a new one.</Banner></div><p className="mt-4"><Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">Request a new link</Link></p></Shell>;
  if (done) return <Shell title="Password changed"><div className="mt-6"><Banner tone="low">Your password was changed and you were signed out everywhere. Taking you to log in.</Banner></div></Shell>;
  const matches = confirm.length > 0 && confirm === password;
  return (
    <Shell title="Choose a new password" lead="Pick something you do not use anywhere else.">
      {err ? <div className="mt-6"><Banner title="Could not reset the password">{err}</Banner></div> : null}
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <Field label="New password" htmlFor="rp-pw" error={errs.password}>
          <PasswordInput id="rp-pw" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrs({}); }} aria-invalid={!!errs.password} aria-describedby="rp-rules" />
        </Field>
        <PasswordStrength id="rp-rules" password={password} />
        <Field label="Confirm new password" htmlFor="rp-confirm" error={errs.confirm} hint={matches ? <span className="inline-flex items-center gap-1.5 font-medium text-primary"><Check size={14} aria-hidden />Passwords match</span> : undefined}>
          <PasswordInput id="rp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrs({}); }} aria-invalid={!!errs.confirm} />
        </Field>
        <Button type="submit" loading={busy} className="min-h-12 w-full text-[0.9375rem]">Change password</Button>
      </form>
    </Shell>
  );
}