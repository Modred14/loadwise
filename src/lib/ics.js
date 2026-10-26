// Builds an iCalendar (.ics) file so deadlines and study sessions can be added to
// any calendar app, with reminders. Times are "floating" local times: they appear
// at the same wall-clock time in the student's calendar, matching how LoadWise stores them.
import { TYPE_CONFIG, dueInstant, parseDateOnly, toDateKey } from "./engine/index.js";

const CRLF = "\r\n";
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dateOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const escapeText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (RFC 5545), never splitting a multi-byte character. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { parts.push(current); current = ""; bytes = 0; limit = 74; }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

const alarm = (trigger, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];

export function buildIcs({ tasks = [], sessions = [], courses = [], now = new Date(), deadlines = true, studySessions = true } = {}) {
  const courseOf = (id) => courses.find((c) => c.id === id);
  const taskOf = (id) => tasks.find((t) => t.id === id);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LoadWise//Academic Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:LoadWise"];
  const dtstamp = stamp(now);
  let count = 0;

  if (deadlines) {
    for (const t of tasks) {
      if (t.status === "completed" || t.completedAt) continue;
      const day = parseDateOnly(t.dueDate);
      if (!day) continue;
      const c = courseOf(t.courseId);
      const cfg = TYPE_CONFIG[t.type] ?? TYPE_CONFIG.other;
      const summary = `${cfg.label}: ${t.title}${c?.code ? ` (${c.code})` : ""}`;
      const desc = [t.description, c?.name, t.estimatedHours ? `Preparation: ${t.estimatedHours}h` : null].filter(Boolean).join("\n");
      lines.push("BEGIN:VEVENT", `UID:task-${t.id}@loadwise`, `DTSTAMP:${dtstamp}`);
      if (t.dueTime) {
        const start = dueInstant(t.dueDate, t.dueTime);
        if (!start) continue;
        lines.push(`DTSTART:${local(start)}`, `DTEND:${local(new Date(start.getTime() + 30 * 60_000))}`);
      } else {
        const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${dateOnly(day)}`, `DTEND;VALUE=DATE:${dateOnly(next)}`);
      }
      lines.push(`SUMMARY:${escapeText(summary)}`);
      if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
      lines.push(...alarm("-P1D", `${t.title} is due tomorrow`));
      if (cfg.major && t.dueTime) lines.push(...alarm("-PT2H", `${t.title} starts in 2 hours`));
      lines.push("END:VEVENT");
      count++;
    }
  }

  if (studySessions) {
    for (const s of sessions) {
      if (s.status !== "planned") continue;
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
      const a = m.exec(s.startsAt ?? ""), b = m.exec(s.endsAt ?? "");
      if (!a || !b) continue;
      const da = parseDateOnly(a[1]), db = parseDateOnly(b[1]);
      if (!da || !db) continue;
      const start = new Date(da.getFullYear(), da.getMonth(), da.getDate(), +a[2], +a[3]);
      const end = new Date(db.getFullYear(), db.getMonth(), db.getDate(), +b[2], +b[3]);
      const t = taskOf(s.taskId);
      const c = courseOf(s.courseId ?? t?.courseId);
      lines.push(
        "BEGIN:VEVENT", `UID:session-${s.id}@loadwise`, `DTSTAMP:${dtstamp}`,
        `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
        `SUMMARY:${escapeText(`Study: ${t?.title ?? "session"}${c?.code ? ` (${c.code})` : ""}`)}`,
        ...(s.reason ? [`DESCRIPTION:${escapeText(s.reason)}`] : []),
        ...alarm("-PT10M", "Study session starts in 10 minutes"),
        "END:VEVENT",
      );
      count++;
    }
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(foldLine).join(CRLF) + CRLF, count };
}

export const icsFilename = (now, kind) => `loadwise-${kind}-${toDateKey(now)}.ics`;
