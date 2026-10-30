import crypto from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http.js";

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE = "lw_session";
const SESSION_DAYS = 30;
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
export const DUMMY_HASH = await hashPassword("not-a-real-password");

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("base64url");

export function validatePassword(f, name, v) {
  if (typeof v !== "string" || v.length < 8) f.fail(name, "Use at least 8 characters");
  else if (v.length > 200) f.fail(name, "Use at most 200 characters");
  else f.values[name] = v;
}

export async function createSession(db, userId, userAgent) {
  const token = newToken();
  await db.query(
    `insert into sessions (user_id, token_hash, user_agent, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`,
    [userId, sha256(token), (userAgent ?? "").slice(0, 300), SESSION_DAYS],
  );
  return token;
}

export function sessionCookie(token, { secure }) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}
export const clearCookie = ({ secure }) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

export function readCookie(req, name) {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Looks up the signed-in user for a request; null when missing/expired. Slides last_used_at hourly. */
export async function userFromRequest(db, req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await db.query(
    `select s.id as session_id, s.last_used_at, u.id, u.name, u.email, u.role, u.department_id,
            d.name as department_name,
            coalesce((select array_agg(cr.catalog_id) from course_reps cr where cr.user_id = u.id), '{}') as rep_catalog_ids
       from sessions s join users u on u.id = s.user_id left join departments d on d.id = u.department_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  const r = rows[0];
  if (!r) return null;
  if (Date.now() - new Date(r.last_used_at).getTime() > 3_600_000) {
    await db.query("update sessions set last_used_at = now() where id = $1", [r.session_id]);
  }
  return { id: r.id, sessionId: r.session_id, name: r.name, email: r.email, role: r.role, departmentId: r.department_id, departmentName: r.department_name, repCatalogIds: r.rep_catalog_ids };
}

export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  departmentId: u.departmentId ?? null, departmentName: u.departmentName ?? null,
  isRep: (u.repCatalogIds ?? []).length > 0, repCatalogIds: u.repCatalogIds ?? [],
});

export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) throw new HttpError(403, "FORBIDDEN", "You do not have permission to do that.");
}
