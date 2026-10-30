// src/lib/api/client.js
// The only place the frontend talks to the backend. Endpoints follow docs/API_CONTRACT.md.
// The API ships inside this app at /api. Set NEXT_PUBLIC_API_BASE_URL only to point at a different backend.
// Only a path ("/api") or an http(s) URL is a valid API base. Anything else (an empty value, or a database
// URL pasted by mistake) is ignored so the app falls back to its own /api instead of failing every request.
const RAW = process.env.NEXT_PUBLIC_API_BASE_URL;
const BASE = (RAW && /^(\/|https?:\/\/)/.test(RAW) ? RAW : "/api").replace(/\/$/, "");
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
  413: "That file is too large.",
  429: "Too many requests. Please wait a moment and try again.",
  503: "The service is temporarily unavailable. Please try again shortly.",
};

async function request(method, path, body, { form = false, timeout = 15000 } = {}) {
  if (!apiConfigured) {
    throw new ApiError(0, "NOT_CONFIGURED", "The backend is not connected yet. Set NEXT_PUBLIC_API_BASE_URL.");
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined && !form ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
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
    forgot: (email) => request("POST", "/auth/forgot", { email }),
    reset: (b) => request("POST", "/auth/reset", b),
    changePassword: (b) => request("POST", "/auth/change-password", b),
    logoutAll: () => request("POST", "/auth/logout-all", {}),
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
    rank: async (order) => items(await request("PUT", "/courses/ranking", { order })),
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
  profile: {
    update: (b) => request("PATCH", "/profile", b),
    departments: async () => items(await request("GET", "/departments")),
  },
  notifications: {
    list: async () => items(await request("GET", "/notifications")),
    read: (id) => request("POST", `/notifications/${encodeURIComponent(id)}/read`, {}),
    readAll: () => request("POST", "/notifications/read-all", {}),
  },
  catalog: {
    list: async () => items(await request("GET", "/catalog")),
    create: (b) => request("POST", "/catalog", b),
    update: (id, b) => request("PATCH", `/catalog/${encodeURIComponent(id)}`, b),
    remove: (id) => request("DELETE", `/catalog/${encodeURIComponent(id)}`),
    reps: async (id) => items(await request("GET", `/catalog/${encodeURIComponent(id)}/reps`)),
    addRep: (id, email) => request("POST", `/catalog/${encodeURIComponent(id)}/reps`, { email }),
    removeRep: (id, userId) => request("DELETE", `/catalog/${encodeURIComponent(id)}/reps/${encodeURIComponent(userId)}`),
  },
  shared: {
    list: async (catalogId) => items(await request("GET", `/shared-deadlines${qs({ catalogId })}`)),
    create: (b) => request("POST", "/shared-deadlines", b),
    update: (id, b) => request("PATCH", `/shared-deadlines/${encodeURIComponent(id)}`, b),
    remove: (id) => request("DELETE", `/shared-deadlines/${encodeURIComponent(id)}`),
  },
  materials: {
    list: (f) => request("GET", `/materials${qs(f)}`),
    usage: () => request("GET", "/materials/usage"),
    upload: (formData) => request("POST", "/materials", formData, { form: true, timeout: 60000 }),
    update: (id, b) => request("PATCH", `/materials/${encodeURIComponent(id)}`, b),
    setTasks: (id, taskIds) => request("PUT", `/materials/${encodeURIComponent(id)}/tasks`, { taskIds }),
    remove: (id) => request("DELETE", `/materials/${encodeURIComponent(id)}`),
    fileUrl: (id, inline) => `${BASE}/materials/${encodeURIComponent(id)}/file${inline ? "?inline=1" : ""}`,
  },
  workload: {
    snapshot: () => request("POST", "/workload/snapshot", {}),
    trend: (days = 60) => request("GET", `/workload/trend?days=${days}`),
  },
  department: {
    insights: () => request("GET", "/department/insights"),
  },
  reminders: {
    status: () => request("GET", "/reminders/status"),
    test: (channel) => request("POST", "/reminders/test", { channel }),
    publicKey: () => request("GET", "/push/public-key"),
    subscribe: (b) => request("POST", "/push/subscribe", b),
    unsubscribe: (endpoint) => request("POST", "/push/unsubscribe", { endpoint }),
  },
  account: {
    exportUrl: `${BASE}/account/export`,
    remove: (password) => request("DELETE", "/account", { password }),
  },
};