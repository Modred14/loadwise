// Integration-test harness: a throwaway real PostgreSQL database per test file.
// Needs TEST_DATABASE_URL pointing at a server where the user can CREATE DATABASE (e.g. a local Postgres).
import crypto from "node:crypto";
import pg from "pg";
import { migrate } from "../../scripts/migrate.mjs";
import { wrapPool } from "./db.js";
import { handle } from "./routes.js";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export async function createTestDb() {
  const base = new URL(process.env.TEST_DATABASE_URL);
  const name = `lw_test_${crypto.randomBytes(5).toString("hex")}`;
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  await admin.query(`create database ${name}`);
  const url = new URL(base); url.pathname = `/${name}`;
  await migrate(url.toString(), { log: () => {} });
  const pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
  pool.on("error", () => {});
  const db = wrapPool(pool);
  return {
    db,
    async close() { await pool.end(); await admin.query(`drop database if exists ${name} with (force)`); await admin.end(); },
  };
}

/** A tiny API client with its own cookie jar, calling the router directly. */
export function client(db, ip = "10.0.0.1") {
  let cookie = "";
  async function call(method, path, body, extra = {}) {
    const headers = { origin: "http://localhost", host: "localhost", "x-forwarded-for": ip, ...extra.headers };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await handle(new Request(`http://localhost/api${path}`, { method, headers, body: payload }), { db });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const [kv] = c.split(";"); if (kv.endsWith("=")) cookie = ""; else cookie = kv; }
    const type = res.headers.get("content-type") ?? "";
    const data = res.status === 204 ? null : type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return { get: (p, h) => call("GET", p, undefined, { headers: h }), post: (p, b, h) => call("POST", p, b ?? {}, { headers: h }), put: (p, b) => call("PUT", p, b ?? {}), patch: (p, b) => call("PATCH", p, b ?? {}), del: (p) => call("DELETE", p), raw: call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

let n = 0;
export async function registerUser(c, over = {}) {
  n++;
  const body = { name: `User ${n}`, email: `user${n}-${crypto.randomBytes(3).toString("hex")}@example.com`, password: "correct-horse-1", ...over };
  const res = await c.post("/auth/register", body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.data)}`);
  return { ...res.data.user, email: body.email, password: body.password };
}
