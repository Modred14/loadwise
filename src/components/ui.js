"use client";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, OctagonAlert, X } from "lucide-react";

import { cx } from "@/lib/cx";
export { cx };

/* ---------------------------------------------------------------- Buttons */
const BUTTON = {
  // Tactile "key": a hard edge underneath that compresses when pressed.
  primary:
    "bg-primary text-white shadow-key hover:bg-primary-hover hover:-translate-y-px active:translate-y-0.5 active:shadow-none disabled:shadow-none disabled:hover:translate-y-0",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink hover:bg-surface-2 active:translate-y-px",
  ghost: "text-ink hover:bg-primary-soft active:bg-primary-soft",
  danger:
    "bg-crit text-white shadow-[0_2px_0_#6e1d08] hover:-translate-y-px active:translate-y-0.5 active:shadow-none disabled:shadow-none disabled:hover:translate-y-0",
};

export function Button({ variant = "primary", loading = false, disabled, className, children, icon: Icon, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex min-h-(--ctl-h) select-none items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-55",
        BUTTON[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={16} className="anim-spin" aria-hidden /> : Icon ? <Icon size={16} aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Icon-only button with a guaranteed accessible name and touch target. */
export function IconButton({ label, icon: Icon, tone = "default", className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "flex size-(--ctl-h) shrink-0 items-center justify-center rounded-md text-muted transition-colors disabled:opacity-50",
        tone === "danger" ? "hover:bg-crit-soft hover:text-crit" : "hover:bg-primary-soft hover:text-ink",
        className,
      )}
      {...props}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ Forms */
export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium">{label}</label>
      {children}
      {hint && !error ? <p className="t-small">{hint}</p> : null}
      {error ? <p role="alert" className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-crit"><OctagonAlert size={13} aria-hidden />{error}</p> : null}
    </div>
  );
}

const inputCls =
  "min-h-(--ctl-h) w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink transition-colors placeholder:text-muted/70 hover:border-ink/60 focus-visible:border-primary focus-visible:outline-offset-0 md:text-sm aria-[invalid=true]:border-crit aria-[invalid=true]:bg-crit-soft/30";
export const Input = ({ className, ...p }) => <input className={cx(inputCls, className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea rows={3} className={cx(inputCls, "py-2", className)} {...p} />;
export function Select({ className, children, ...p }) {
  return (
    <div className="relative w-full min-w-0">
      <select className={cx(inputCls, "cursor-pointer pr-9", className)} {...p}>{children}</select>
      <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

/** Single-choice control rendered as a joined row of keys. */
export function Segmented({ value, onChange, options, label, className }) {
  return (
    <div role="group" aria-label={label} className={cx("no-scrollbar inline-flex max-w-full divide-x divide-line overflow-x-auto rounded-md border border-line-strong bg-surface", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex min-h-(--ctl-h) shrink-0 items-center gap-1.5 px-3.5 text-[0.8125rem] font-medium transition-colors",
              on ? "bg-ink text-white" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {o.label}
            {o.count != null ? <span className={cx("tnum font-mono text-[0.6875rem]", on ? "text-white/70" : "text-muted")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Surfaces */
export function Card({ className, children, ...p }) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)} {...p}>{children}</section>;
}

/** Small section heading used inside cards: label on the left, optional action on the right. */
export function CardHead({ title, action, id, className }) {
  return (
    <div className={cx("flex min-h-12 items-center justify-between gap-3 border-b border-line px-4", className)}>
      <h2 id={id} className="t-section">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8">
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow ? <p className="t-label mb-2">{eyebrow}</p> : null}
        <h1 className="t-page">{title}</h1>
        {description ? <p className="t-small mt-2 max-w-2xl text-[0.875rem]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface-2 text-muted border-line",
  info: "bg-primary-soft text-primary border-transparent",
  low: "bg-ok-soft text-ok border-transparent",
  medium: "bg-primary-soft text-primary border-transparent",
  warning: "bg-warn-soft text-warn border-transparent",
  high: "bg-warn-soft text-warn border-transparent",
  critical: "bg-crit-soft text-crit border-transparent",
};
export function Badge({ tone = "neutral", children, className }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap", TONES[tone] ?? TONES.neutral, className)}>
      {children}
    </span>
  );
}

const SEV_ICON = { info: Info, warning: AlertTriangle, critical: OctagonAlert };
export function SeverityBadge({ severity }) {
  const Icon = SEV_ICON[severity] ?? Info;
  return <Badge tone={severity}><Icon size={12} aria-hidden />{severity[0].toUpperCase() + severity.slice(1)}</Badge>;
}

const STRIP = { critical: "bg-crit", warning: "bg-warn", low: "bg-ok", info: "bg-primary", neutral: "bg-line-strong" };
export function Banner({ tone = "critical", title, children, action }) {
  const Icon = tone === "critical" ? OctagonAlert : tone === "warning" ? AlertTriangle : tone === "low" ? CheckCircle2 : Info;
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cx("anim-fade relative flex flex-wrap items-start gap-x-3 gap-y-2 overflow-hidden rounded-md py-3 pr-3 pl-4 text-sm", TONES[tone])}>
      <span className={cx("absolute inset-y-0 left-0 w-1", STRIP[tone])} aria-hidden />
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 basis-48">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 className="anim-spin" size={18} aria-hidden /> <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div aria-hidden className={cx("anim-pulse rounded-md bg-line/70", className)} />;
}

/** Thin solid progress bar; `zone` colours it low/medium/high/critical. */
export function Progress({ value, zone = "medium", label, className }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("bar", className)} data-zone={zone} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <b style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon ? (
        <span className="mb-4 flex size-12 items-center justify-center rounded-md border border-line-strong bg-surface-2 text-primary shadow-[0_2px_0_var(--line-strong)]">
          <Icon size={22} aria-hidden />
        </span>
      ) : null}
      <h2 className="font-display text-[1.625rem] leading-tight">{title}</h2>
      {children ? <p className="t-small mt-2 max-w-md text-[0.875rem]">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */
/** Accessible modal; bottom sheet on small screens, centred dialog from sm up. */
export function Dialog({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  const titleId = useId();
  // Keep the latest onClose without re-running the focus logic on every parent render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const node = ref.current;
    const focusables = () => [...(node?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((el) => !el.disabled && el.offsetParent !== null);
    (node?.querySelector("input:not([type=hidden]), select, textarea") ?? focusables()[0])?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  // Portal to <body> so the dialog is never trapped under page-level stacking contexts (e.g. the fixed mobile nav).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="anim-fade absolute inset-0 bg-ink/55" onClick={() => closeRef.current()} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-line-strong bg-surface shadow-[0_24px_60px_-20px_rgb(20_24_31/0.55)] sm:max-h-[88dvh] sm:rounded-lg", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="font-display text-[1.5rem] leading-tight">{title}</h2>
          <IconButton label="Close" icon={X} onClick={() => closeRef.current()} className="-mr-2" />
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:rounded-b-lg">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = "Delete", busy, error }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm">{children}</p>
      {error ? <div className="mt-3"><Banner title="Could not complete the action">{error}</Banner></div> : null}
    </Dialog>
  );
}

/* ------------------------------------------------------------------- Toasts */
const ToastContext = createContext(() => {});
/** `const toast = useToast(); toast("Saved"); toast("Failed", "error");` */
export const useToast = () => useContext(ToastContext);

const TOAST_ICON = { success: CheckCircle2, error: OctagonAlert, info: Info };
function ToastItem({ t, onDone }) {
  const Icon = TOAST_ICON[t.tone] ?? Info;
  useEffect(() => {
    const id = setTimeout(() => onDone(t.id), t.tone === "error" ? 6500 : 3800);
    return () => clearTimeout(id);
  }, [t.id, t.tone, onDone]);
  return (
    <div className="pointer-events-auto relative flex max-w-sm min-w-60 items-start gap-3 overflow-hidden rounded-md bg-ink py-3 pr-3 pl-4 text-sm text-white shadow-[0_12px_32px_-10px_rgb(20_24_31/0.6)]" style={{ animation: "lw-toast 240ms var(--ease) backwards" }}>
      <Icon size={18} className={cx("mt-px shrink-0", t.tone === "error" ? "text-[#ff9b82]" : t.tone === "success" ? "text-signal" : "text-[#a9b8ff]")} aria-hidden />
      <p className="min-w-0 flex-1 break-words">{t.message}</p>
      <button type="button" onClick={() => onDone(t.id)} aria-label="Dismiss notification" className="-my-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-sm text-white/70 hover:bg-white/10 hover:text-white"><X size={14} aria-hidden /></button>
      <span className={cx("absolute inset-x-0 bottom-0 h-0.5 origin-left", t.tone === "error" ? "bg-[#ff9b82]" : "bg-signal")} style={{ animation: `lw-drain ${t.tone === "error" ? 6500 : 3800}ms linear forwards` }} aria-hidden />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const counter = useRef(0);
  const remove = useCallback((id) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((message, tone = "success") => {
    counter.current += 1;
    const id = counter.current;
    setItems((l) => [...l.slice(-2), { id, message, tone }]);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end print:hidden">
        {items.map((t) => <ToastItem key={t.id} t={t} onDone={remove} />)}
      </div>
    </ToastContext.Provider>
  );
}
