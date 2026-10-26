import { TYPE_CONFIG, dueInstant, parseDateOnly } from "@/lib/engine";

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

export const typeLabel = (t) => (TYPE_CONFIG[t] ?? TYPE_CONFIG.other).label;
export const formatDay = (key) => { const d = parseDateOnly(key); return d ? dateFmt.format(d) : key; };
export const formatDayLong = (key) => { const d = parseDateOnly(key); return d ? longFmt.format(d) : key; };
export const formatMonth = (date) => monthFmt.format(date);
export const formatTimeStr = (hhmm) => hhmm ?? "";
export const formatDue = (task) => `${formatDay(task.dueDate)}${task.dueTime ? `, ${task.dueTime}` : ""}`;
export const formatClock = (localIso) => localIso?.slice(11, 16) ?? "";

export function relativeDue(task, now) {
  const due = dueInstant(task.dueDate, task.dueTime);
  if (!due || !now) return "";
  const hours = (due - now) / 3_600_000;
  if (hours < 0) {
    const d = Math.ceil(-hours / 24);
    return `Overdue by ${d} day${d === 1 ? "" : "s"}`;
  }
  if (hours < 1) return "Due within the hour";
  if (hours < 24) return `Due in ${Math.floor(hours)}h`;
  const d = Math.floor(hours / 24);
  return d === 1 ? "Due tomorrow" : `Due in ${d} days`;
}

export const formatHours = (h) => `${Math.round(h * 10) / 10}h`;
export { timeFmt };
