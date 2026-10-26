"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Banner, Button, Card, Field, Input } from "@/components/ui";
import { Logo } from "@/components/AppShell";

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { status, login, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
    <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <div className="mb-6"><Logo /></div>
      <Card className="anim-page w-full max-w-sm p-5 sm:p-6">
        <h1 className="t-page">{isRegister ? "Create your account" : "Log in"}</h1>
        <p className="t-small mt-1">{isRegister ? "Track your courses and deadlines." : "Welcome back."}</p>
        {status === "unconfigured" ? (
          <div className="mt-4"><Banner tone="warning" title="Backend not connected">Set NEXT_PUBLIC_API_BASE_URL to sign in.</Banner></div>
        ) : null}
        {error ? <div className="mt-4"><Banner title={isRegister ? "Could not create account" : "Could not log in"}>{error}</Banner></div> : null}
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          {isRegister ? (
            <Field label="Name" htmlFor="name" error={fields.name}>
              <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!fields.name} />
            </Field>
          ) : null}
          <Field label="Email" htmlFor="email" error={fields.email}>
            <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!fields.email} />
          </Field>
          <Field label="Password" htmlFor="password" error={fields.password}>
            <Input id="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={form.password} onChange={set("password")} aria-invalid={!!fields.password} />
          </Field>
          <Button type="submit" loading={busy} disabled={status === "unconfigured"}>{isRegister ? "Create account" : "Log in"}</Button>
        </form>
        <p className="t-small mt-4">
          {isRegister ? "Already registered? " : "New to LoadWise? "}
          <Link href={isRegister ? "/login" : "/register"} className="font-medium text-primary underline">{isRegister ? "Log in" : "Create an account"}</Link>
        </p>
      </Card>
    </main>
  );
}
