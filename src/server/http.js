// Request/response helpers shared by every handler. Relative imports only so tests can run under plain Node.

/** Explicit HTTP response from a handler. Plain returned objects are always a 200 JSON body. */
export class Reply {
  constructor(status, body, headers) { this.status = status; this.body = body; this.headers = headers; }
}

export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields ?? undefined;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
export const notFound = (what = "That item") => new HttpError(404, "NOT_FOUND", `${what} was not found.`);

const TYPES = ["test", "assignment", "continuous_assessment", "exam", "project", "other"];
export const TASK_TYPES = TYPES;

/** Collects per-field validation errors, then throws one 400 listing them all. */
export class Fields {
  constructor() { this.errors = {}; this.values = {}; }
  fail(name, msg) { if (!this.errors[name]) this.errors[name] = msg; }
  _absent(v) { return v === undefined || v === null || v === ""; }
  str(name, v, { min = 1, max = 1000, optional = false, nullable = false, label = name } = {}) {
    if (v === undefined && optional) return this;
    if (this._absent(v)) { if (nullable) { this.values[name] = null; return this; } if (min === 0) { this.values[name] = ""; return this; } this.fail(name, `${label} is required`); return this; }
    if (typeof v !== "string") { this.fail(name, `${label} must be text`); return this; }
    const s = v.trim();
    if (s.length < min) this.fail(name, `${label} is required`);
    else if (s.length > max) this.fail(name, `${label} must be at most ${max} characters`);
    else this.values[name] = s;
    return this;
  }
  enum(name, v, list, { optional = false } = {}) {
    if (v === undefined && optional) return this;
    if (!list.includes(v)) this.fail(name, `Choose one of: ${list.join(", ")}`);
    else this.values[name] = v;
    return this;
  }
  int(name, v, { min, max, optional = false, nullable = false } = {}) {
    if (v === undefined && optional) return this;
    if (v === null && nullable) { this.values[name] = null; return this; }
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (!Number.isInteger(n) || n < min || n > max) this.fail(name, `Enter a whole number from ${min} to ${max}`);
    else this.values[name] = n;
    return this;
  }
  num(name, v, { min, max, optional = false, nullable = false } = {}) {
    if (v === undefined && optional) return this;
    if ((v === null || v === "") && nullable) { this.values[name] = null; return this; }
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) this.fail(name, `Enter a number from ${min} to ${max}`);
    else this.values[name] = n;
    return this;
  }
  bool(name, v, { optional = false } = {}) {
    if (v === undefined && optional) return this;
    if (typeof v !== "boolean") this.fail(name, "Must be true or false");
    else this.values[name] = v;
    return this;
  }
  date(name, v, { optional = false } = {}) {
    if (v === undefined && optional) return this;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) this.fail(name, "Use a valid date (YYYY-MM-DD)");
    else this.values[name] = v;
    return this;
  }
  time(name, v, { optional = false, nullable = true } = {}) {
    if (v === undefined && optional) return this;
    if (this._absent(v)) { if (nullable) this.values[name] = null; else this.fail(name, "Time is required"); return this; }
    if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) this.fail(name, "Use a valid time (HH:mm)");
    else this.values[name] = v;
    return this;
  }
  uuid(name, v, { optional = false, nullable = false } = {}) {
    if (v === undefined && optional) return this;
    if ((v === null || v === "") && nullable) { this.values[name] = null; return this; }
    if (!isUuid(v)) this.fail(name, "Invalid reference");
    else this.values[name] = v;
    return this;
  }
  done() {
    if (Object.keys(this.errors).length) throw new HttpError(400, "VALIDATION_ERROR", "Please fix the highlighted fields.", this.errors);
    return this.values;
  }
}

export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function clientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

/**
 * Fixed-window rate limiter stored in Postgres (works across serverless instances).
 * Throws 429 when `limit` is exceeded inside `windowSec`.
 */
export async function rateLimit(db, key, limit, windowSec) {
  const { rows } = await db.query(
    `insert into rate_limits (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`,
    [key.slice(0, 300), windowSec],
  );
  if (rows[0].count > limit) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Please wait a while and try again.");
}

export const clampInt = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export const likeEscape = (s) => String(s).replace(/[\\%_]/g, (m) => "\\" + m);
