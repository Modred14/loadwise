// Timezone helpers (no dependency). The engine treats dates as local wall-clock values; the server
// runs in UTC, so we build "local" Dates from a user's wall-clock components for engine calls.

export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string" && tz.length <= 64; } catch { return false; }
}

function parts(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = Number(p.value);
  return o;
}

/** The user's current wall-clock time as a Date whose *local* components equal their wall clock. */
export function wallClockNow(tz = "UTC", at = new Date()) {
  const p = parts(at, validTimeZone(tz) ? tz : "UTC");
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** 'YYYY-MM-DD' + 'HH:mm' wall-clock time in `tz` -> the absolute UTC instant. */
export function zonedToUtc(dateStr, timeStr, tz = "UTC") {
  const zone = validTimeZone(tz) ? tz : "UTC";
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = (timeStr ?? "23:59").split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms) => { const p = parts(new Date(ms), zone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess); // second pass handles DST boundaries
  return new Date(guess);
}

export const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
