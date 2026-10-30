import { ArrowRight, Check, X } from "lucide-react";
import { Badge, Button, SeverityBadge } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatClock, formatDay } from "@/lib/format";

const SEV_STRIP = { critical: "bg-crit", warning: "bg-[var(--zone-high)]", info: "bg-[var(--zone-medium)]" };

/** Presentational warning: what is wrong, why it matters, and what to do next. */
export function WarningCard({ w, course, onDismiss, onRead, busy, className }) {
  const unread = w.id && !w.readAt && w.severity !== "info";
  return (
    <article className={cx("relative overflow-hidden rounded-lg border bg-surface pl-5", w.severity === "critical" ? "border-crit/35" : "border-line", className)}>
      <span className={cx("absolute inset-y-0 left-0 w-1.5", SEV_STRIP[w.severity] ?? SEV_STRIP.info)} aria-hidden />
      <div className="py-3.5 pr-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <SeverityBadge severity={w.severity} />
          {course ? <Badge className="font-mono">{course.code ?? course.name}</Badge> : null}
          {unread ? <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><span className="anim-blip size-1.5 bg-primary" aria-hidden />New</span> : null}
          {w.actionBy ? <span className="t-small tnum ml-auto">Act by {formatDay(w.actionBy.slice(0, 10))}, {formatClock(w.actionBy)}</span> : null}
        </div>
        <h3 className="mt-2.5 text-[0.9375rem] leading-snug font-semibold">{w.title}</h3>
        <p className="mt-1 text-sm text-muted">{w.why}</p>
        <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm"><ArrowRight size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /><span><span className="font-semibold">Next: </span>{w.nextStep}</span></p>
        {(onDismiss || onRead) && w.id ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {onRead && !w.readAt ? <Button variant="secondary" icon={Check} loading={busy === `r${w.id}`} onClick={() => onRead(w)}>Mark read</Button> : null}
            {onDismiss ? <Button variant="ghost" icon={X} loading={busy === `d${w.id}`} onClick={() => onDismiss(w)}>Dismiss</Button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
