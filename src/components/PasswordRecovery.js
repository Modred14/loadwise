"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/brand";
import { api } from "@/lib/api/client";

function Shell({ title, lead, children }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <div className="mb-8"><Logo /></div>
      <div className="anim-page w-full max-w-sm">
        <p className="t-label">Your account</p>
        <h1 className="t-page mt-2 text-[2.25rem]">{title}</h1>
        {lead ? <p className="t-small mt-2 text-[0.9375rem]">{lead}</p> : null}
        {children}
        <p className="mt-8"><Link href="/login" className="t-small underline underline-offset-4 hover:text-ink">Back to log in</Link></p>
      </div>
    </main>
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
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr("Enter a valid email address."); return; }
    setBusy(true); setErr(null);
    try { await api.auth.forgot(email.trim()); setDone(true); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (done) return (
    <Shell title="Check your email">
      <div className="mt-5"><Banner tone="info">If an account exists for {email}, we have sent a link to reset the password. It is valid for one hour.</Banner></div>
    </Shell>
  );
  return (
    <Shell title="Reset your password" lead="Enter your email and we will send you a link to choose a new password.">
      {err ? <div className="mt-5"><Banner title="Could not send the link">{err}</Banner></div> : null}
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
        <Field label="Email" htmlFor="fp-email"><Input id="fp-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" loading={busy} className="min-h-12">Send reset link</Button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const router = useRouter();
  const [token, setToken] = useState(undefined);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [fieldErr, setFieldErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setToken(new URLSearchParams(window.location.search).get("token") ?? ""), 0); return () => clearTimeout(t); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setFieldErr("Use at least 8 characters"); return; }
    setFieldErr(null); setBusy(true); setErr(null);
    try { await api.auth.reset({ token, password }); setDone(true); setTimeout(() => router.replace("/login"), 1800); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (token === undefined) return <Shell title="Choose a new password" />;
  if (!token) return <Shell title="Link not valid"><div className="mt-5"><Banner title="This reset link is incomplete">Open the link from your email again, or request a new one.</Banner></div><p className="mt-4"><Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">Request a new link</Link></p></Shell>;
  if (done) return <Shell title="Password changed"><div className="mt-5"><Banner tone="low">Your password was changed and you were signed out everywhere. Taking you to log in.</Banner></div></Shell>;
  return (
    <Shell title="Choose a new password">
      {err ? <div className="mt-5"><Banner title="Could not reset the password">{err}</Banner></div> : null}
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
        <Field label="New password" htmlFor="rp-pw" error={fieldErr} hint="At least 8 characters."><Input id="rp-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldErr} /></Field>
        <Button type="submit" loading={busy} className="min-h-12">Change password</Button>
      </form>
    </Shell>
  );
}
