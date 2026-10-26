// The only place the frontend talks to the backend. Endpoints follow docs/API_CONTRACT.md.
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
export const apiConfigured = BASE.length > 0;

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields ?? null;
  }
}

const FRIENDLY = {
  0: "Could not reach the server. Check your connection and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You do not have permission to do that.",
  404: "That item no longer exists.",
  409: "This changed elsewhere or already exists. Refresh and try again.",
  429: "Too many requests. Please wait a moment and try again.",
};

async function request(method, path, body) {
  if (!apiConfigured) {
    throw new ApiError(0, "NOT_CONFIGURED", "The backend is not connected yet. Set NEXT_PUBLIC_API_BASE_URL.");
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0, "NETWORK", FRIENDLY[0]);
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = data?.error;
    const message = e?.message && res.status < 500 ? e.message : (FRIENDLY[res.status] ?? "Something went wrong on the server. Please try again.");
    throw new ApiError(res.status, e?.code ?? "ERROR", message, e?.fields);
  }
  return data;
}

const items = (d) => (Array.isArray(d) ? d : (d?.items ?? []));
const qs = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
  return p.size ? `?${p}` : "";
};

export const api = {
  auth: {
    me: () => request("GET", "/auth/me"),
    login: (b) => request("POST", "/auth/login", b),
    register: (b) => request("POST", "/auth/register", b),
    logout: () => request("POST", "/auth/logout", {}),
  },
  preferences: {
    get: () => request("GET", "/preferences"),
    put: (b) => request("PUT", "/preferences", b),
  },
  courses: {
    list: async () => items(await request("GET", "/courses")),
    create: (b) => request("POST", "/courses", b),
    update: (id, b) => request("PATCH", `/courses/${encodeURIComponent(id)}`, b),
    remove: (id, cascade) => request("DELETE", `/courses/${encodeURIComponent(id)}${cascade ? "?cascade=true" : ""}`),
  },
  tasks: {
    list: async (f) => items(await request("GET", `/tasks${qs(f)}`)),
    create: (b) => request("POST", "/tasks", b),
    update: (id, b) => request("PATCH", `/tasks/${encodeURIComponent(id)}`, b),
    remove: (id) => request("DELETE", `/tasks/${encodeURIComponent(id)}`),
  },
  sessions: {
    list: async (f) => items(await request("GET", `/study-sessions${qs(f)}`)),
    update: (id, b) => request("PATCH", `/study-sessions/${encodeURIComponent(id)}`, b),
    replacePlan: (sessions) => request("PUT", "/study-sessions/plan", { sessions }),
  },
  warnings: {
    list: async () => items(await request("GET", "/warnings")),
    sync: (b) => request("POST", "/warnings/sync", b),
    dismiss: (id) => request("POST", `/warnings/${encodeURIComponent(id)}/dismiss`, {}),
    read: (id) => request("POST", `/warnings/${encodeURIComponent(id)}/read`, {}),
  },
};
