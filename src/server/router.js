// Tiny router so the API is a plain function: handle(Request) -> Response. Route handlers in
// src/app/api call it; tests call it directly with a test database.
import { getDb } from "./db.js";
import { HttpError, Reply, isUuid } from "./http.js";
import { clearCookie, userFromRequest } from "./auth.js";

const routes = [];
export function route(method, pattern, handler, { auth = true } = {}) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
  routes.push({ method, re, keys, handler, auth });
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function originAllowed(req, url) {
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let host;
    try { host = new URL(origin).host; } catch { return false; }
    const own = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    return host === own || allowed.includes(origin);
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

export function respond(status, body, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export async function handle(req, { db } = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const secure = url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  try {
    const matched = routes.filter((r) => r.re.test(path));
    if (!matched.length) throw new HttpError(404, "NOT_FOUND", "No such route.");
    const r = matched.find((m) => m.method === req.method);
    if (!r) throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    if (!["GET", "HEAD"].includes(req.method) && !originAllowed(req, url)) throw new HttpError(403, "BAD_ORIGIN", "Cross-site requests are not allowed.");

    const m = r.re.exec(path);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    for (const [k, v] of Object.entries(params)) if (/id$/i.test(k) && !isUuid(v)) throw new HttpError(404, "NOT_FOUND", "That item was not found.");

    const database = db ?? getDb();
    const cookies = [];
    const ctx = {
      req, url, params, db: database, secure, user: null, cookies,
      query: Object.fromEntries(url.searchParams),
      setCookie: (c) => cookies.push(c),
      async json() {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
        const text = await req.text();
        if (text.length > 1_000_000) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
        try { const v = text ? JSON.parse(text) : {}; if (v === null || typeof v !== "object") throw 0; return v; } catch { throw new HttpError(400, "BAD_JSON", "Request body is not valid JSON."); }
      },
    };
    if (r.auth) {
      ctx.user = await userFromRequest(database, req);
      if (!ctx.user) {
        const res = respond(401, { error: { code: "UNAUTHENTICATED", message: "Please log in." } });
        if (req.headers.get("cookie")?.includes("lw_session=")) res.headers.append("Set-Cookie", clearCookie({ secure }));
        return res;
      }
    }
    const out = await r.handler(ctx);
    if (out instanceof Response) { cookies.forEach((c) => out.headers.append("Set-Cookie", c)); return out; }
    const res = out instanceof Reply ? respond(out.status, out.body, out.headers) : respond(200, out ?? {});
    cookies.forEach((c) => res.headers.append("Set-Cookie", c));
    return res;
  } catch (e) {
    if (e instanceof HttpError) return respond(e.status, { error: { code: e.code, message: e.message, fields: e.fields } });
    // Postgres: unique violation / bad input. Everything else is logged server-side only.
    if (e?.code === "23505") return respond(409, { error: { code: "CONFLICT", message: "That already exists." } });
    if (e?.code === "23503") return respond(400, { error: { code: "BAD_REFERENCE", message: "A referenced item does not exist." } });
    if (e?.code === "22P02" || e?.code === "22007" || e?.code === "22008") return respond(400, { error: { code: "BAD_INPUT", message: "Some input was not in the expected format." } });
    console.error("[api]", req.method, path, e?.stack ?? e);
    return respond(500, { error: { code: "INTERNAL", message: "Something went wrong on the server." } });
  }
}
