// src/components/PasswordField.js
"use client";
import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Input, cx } from "@/components/ui";
import { checkPassword } from "@/lib/password";

/** Password input with a show/hide toggle. Accepts everything an <Input> does. */
export function PasswordInput({ className, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cx("min-h-12 pr-12", className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label="Show password"
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted transition-colors hover:text-ink"
      >
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}

/**
 * Four rising ticks (the same language as the logo and the load rail), a text label, and a checklist.
 * Meaning never relies on colour alone: every state has a word and an icon.
 */
export function PasswordStrength({ password, id }) {
  const c = checkPassword(password);
  return (
    <div id={id} className="flex flex-col gap-3 border-l-2 border-line-strong pl-4">
      <div className="flex items-center gap-3">
        <div className="flex h-5 items-end gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{ height: 8 + i * 4 }}
              className={cx("w-5 transition-colors duration-200", i < c.level ? (c.level === 1 ? "bg-crit" : "bg-primary") : "bg-line-strong")}
            />
          ))}
        </div>
        <p aria-live="polite" className={cx("text-[0.8125rem] font-medium", password ? "text-ink" : "text-muted")}>
          {password ? `${c.label} password` : "Choose a strong password"}
        </p>
      </div>
      <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {c.rules.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-2 text-[0.8125rem]", r.ok ? "text-ink" : "text-muted")}>
            {r.ok ? <Check size={14} className="shrink-0 text-primary" aria-hidden /> : <Circle size={14} className="shrink-0" aria-hidden />}
            <span>{r.label}<span className="sr-only">{r.ok ? ", met" : ", not met"}</span></span>
          </li>
        ))}
      </ul>
      {c.common ? <p className="text-[0.8125rem] font-medium text-ink">This password is too common. Choose something less guessable.</p> : null}
    </div>
  );
}