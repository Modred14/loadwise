// Date helpers for the engine.
//
// Convention: every date/time the engine handles is a *local wall-clock* value
// in the student's own timezone. Dates are 'YYYY-MM-DD', times are 'HH:mm'.
// We build Dates from numeric components (never `new Date("YYYY-MM-DD")`, which
// is parsed as UTC and shifts deadlines to the wrong day in western timezones).

export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;

const pad = (n) => String(n).padStart(2, "0");

export function parseDateOnly(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export function parseTimeOfDay(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  if (h > 23 || mi > 59) return null;
  return { hours: h, minutes: mi, totalMinutes: h * 60 + mi };
}

/**
 * Due instant of a task. A missing time means "end of that day" (23:59), so a
 * task due "today" with no time is not treated as overdue until the day ends.
 */
export function dueInstant(dueDate, dueTime) {
  const day = parseDateOnly(dueDate);
  if (!day) return null;
  const time = dueTime == null || dueTime === "" ? { hours: 23, minutes: 59 } : parseTimeOfDay(dueTime);
  if (!time) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes);
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
  d.setDate(d.getDate() + n);
  return d;
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalDateTime(date) {
  return `${toDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Whole calendar days from a to b (negative when b is earlier). DST-safe. */
export function calendarDaysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS_DAY);
}

export function atMinutes(day, totalMinutes) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, totalMinutes);
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}
