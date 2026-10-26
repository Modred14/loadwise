"use client";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonAlert, X } from "lucide-react";

const cx = (...c) => c.filter(Boolean).join(" ");

const BUTTON = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink hover:bg-primary-soft",
  danger: "bg-crit text-white hover:opacity-90",
};

export function Button({ variant = "primary", loading = false, disabled, className, children, icon: Icon, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 md:min-h-9",
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

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error ? <p className="t-small">{hint}</p> : null}
      {error ? <p role="alert" className="text-sm text-crit">{error}</p> : null}
    </div>
  );
}

const inputCls =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-muted/70 md:min-h-9 md:text-sm aria-[invalid=true]:border-crit";
export const Input = ({ className, ...p }) => <input className={cx(inputCls, className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cx(inputCls, className)} {...p}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea rows={3} className={cx(inputCls, "py-2", className)} {...p} />;

export function Card({ className, children, ...p }) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)} {...p}>{children}</section>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="t-page">{title}</h1>
        {description ? <p className="t-small mt-1 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
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
    <span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const SEV_ICON = { info: Info, warning: AlertTriangle, critical: OctagonAlert };
export function SeverityBadge({ severity }) {
  const Icon = SEV_ICON[severity] ?? Info;
  return <Badge tone={severity}><Icon size={12} aria-hidden />{severity[0].toUpperCase() + severity.slice(1)}</Badge>;
}

export function Banner({ tone = "critical", title, children, action }) {
  const Icon = tone === "critical" ? OctagonAlert : tone === "warning" ? AlertTriangle : tone === "low" ? CheckCircle2 : Info;
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cx("anim-fade flex items-start gap-3 rounded-lg p-3 text-sm", TONES[tone])}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
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
  return <div aria-hidden className={cx("anim-pulse rounded-md bg-line/60", className)} />;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon ? <Icon size={28} className="mb-3 text-primary" aria-hidden /> : null}
      <h2 className="t-section">{title}</h2>
      {children ? <p className="t-small mt-1 max-w-md">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Accessible modal; bottom sheet on small screens, centred dialog from sm up. */
export function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const node = ref.current;
    const focusables = () => node?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [];
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = [...focusables()];
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
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body> so the dialog is never trapped under page-level stacking contexts (e.g. the fixed mobile nav).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="anim-fade absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-surface shadow-lg sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="t-section">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2 md:size-8">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{footer}</div> : null}
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
