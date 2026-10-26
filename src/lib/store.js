"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { computeWorkload, generateStudyPlan, generateWarnings, normalizePrefs, reconcileWarnings } from "@/lib/engine";

const DataContext = createContext(null);

function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const iv = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, []);
  return now;
}

export function DataProvider({ children }) {
  const now = useNow();
  const [data, setData] = useState({ courses: [], tasks: [], sessions: [], warnings: [], prefs: null });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const syncSig = useRef("");

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const [courses, tasks, sessions, warnings, prefs] = await Promise.all([
        api.courses.list(), api.tasks.list(), api.sessions.list(), api.warnings.list(),
        api.preferences.get().catch((e) => { if (e.status === 404) return null; throw e; }),
      ]);
      setData({ courses, tasks, sessions, warnings, prefs });
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const prefs = useMemo(() => normalizePrefs(data.prefs ?? {}), [data.prefs]);

  const workload = useMemo(
    () => (now && status === "ready" ? computeWorkload({ tasks: data.tasks, courses: data.courses, prefs, now }) : null),
    [now, status, data.tasks, data.courses, prefs],
  );

  const plan = useMemo(
    () => (now && status === "ready" ? generateStudyPlan({ tasks: data.tasks, courses: data.courses, prefs, existingSessions: data.sessions, now }) : null),
    [now, status, data.tasks, data.courses, data.sessions, prefs],
  );

  // Raise the PLAN_INFEASIBLE warning only for the plan the student actually has saved.
  const savedPlanConflicts = useMemo(() => {
    const open = data.sessions.some((s) => s.status === "planned");
    return open && plan ? plan : null;
  }, [data.sessions, plan]);

  const generated = useMemo(
    () => (now && status === "ready" ? generateWarnings({ tasks: data.tasks, courses: data.courses, prefs, now, plan: savedPlanConflicts }) : null),
    [now, status, data.tasks, data.courses, prefs, savedPlanConflicts],
  );

  // Persist warnings: backend applies create/update/resolve so refreshes never duplicate.
  useEffect(() => {
    if (!generated) return;
    const diff = reconcileWarnings(data.warnings, generated);
    const n = diff.toCreate.length + diff.toUpdate.length + diff.toResolve.length;
    if (n === 0) return;
    const sig = JSON.stringify([diff.toCreate.map((w) => w.key), diff.toUpdate.map((w) => w.key + w.severity), diff.toResolve]);
    if (sig === syncSig.current) return; // already tried this exact change
    syncSig.current = sig;
    api.warnings.sync(diff).then(() => api.warnings.list()).then((warnings) => setData((d) => ({ ...d, warnings }))).catch(() => {
      /* Warnings still display from the live calculation; retry on next data change. */
    });
  }, [generated, data.warnings]);

  // Persisted active warnings, plus live ones the backend has not stored yet (e.g. sync failed).
  const warningsShown = useMemo(() => {
    const known = new Set(data.warnings.map((w) => w.key));
    const rank = { critical: 0, warning: 1, info: 2 };
    return [
      ...data.warnings.filter((w) => w.status === "active"),
      ...(generated ?? []).filter((g) => !known.has(g.key)).map((g) => ({ ...g, id: null, status: "active", unsynced: true })),
    ].sort((a, b) => rank[a.severity] - rank[b.severity] || String(a.actionBy).localeCompare(String(b.actionBy)));
  }, [data.warnings, generated]);

  const refresh = useCallback(async (...keys) => {
    const map = { courses: api.courses.list, tasks: api.tasks.list, sessions: api.sessions.list, warnings: api.warnings.list };
    const results = await Promise.all(keys.map((k) => map[k]()));
    setData((d) => ({ ...d, ...Object.fromEntries(keys.map((k, i) => [k, results[i]])) }));
  }, []);

  const actions = useMemo(() => ({
    reload: load,
    async saveCourse(id, body) { await (id ? api.courses.update(id, body) : api.courses.create(body)); await refresh("courses"); },
    async deleteCourse(id, cascade) { await api.courses.remove(id, cascade); await refresh("courses", "tasks", "sessions"); },
    async saveTask(id, body) { await (id ? api.tasks.update(id, body) : api.tasks.create(body)); await refresh("tasks", "sessions"); },
    async deleteTask(id) { await api.tasks.remove(id); await refresh("tasks", "sessions"); },
    async setTaskStatus(task, status) {
      await api.tasks.update(task.id, { status, completedAt: status === "completed" ? new Date().toISOString() : null });
      await refresh("tasks", "sessions");
    },
    async setSessionStatus(id, status) { await api.sessions.update(id, { status }); await refresh("sessions", "tasks"); },
    async savePlan(sessions) { await api.sessions.replacePlan(sessions); await refresh("sessions", "tasks"); },
    async savePrefs(body) { const saved = await api.preferences.put(body); setData((d) => ({ ...d, prefs: saved ?? body })); },
    async dismissWarning(id) { await api.warnings.dismiss(id); await refresh("warnings"); },
    async readWarning(id) { await api.warnings.read(id); await refresh("warnings"); },
  }), [load, refresh]);

  const value = useMemo(
    () => ({ ...data, prefs, status, error, now, workload, plan, warningsShown, ...actions }),
    [data, prefs, status, error, now, workload, plan, warningsShown, actions],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
