"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, apiConfigured } from "@/lib/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // status: loading | anonymous | authenticated | unconfigured | error
  const [state, setState] = useState({ status: apiConfigured ? "loading" : "unconfigured", user: null, error: null });

  useEffect(() => {
    if (!apiConfigured) return;
    let live = true;
    api.auth
      .me()
      .then((d) => live && setState({ status: "authenticated", user: d?.user ?? d, error: null }))
      .catch((e) => {
        if (!live) return;
        if (e.status === 401) setState({ status: "anonymous", user: null, error: null });
        else setState({ status: "error", user: null, error: e.message });
      });
    return () => { live = false; };
  }, []);

  const login = useCallback(async (body) => {
    const d = await api.auth.login(body);
    setState({ status: "authenticated", user: d?.user ?? d, error: null });
  }, []);
  const register = useCallback(async (body) => {
    const d = await api.auth.register(body);
    setState({ status: "authenticated", user: d?.user ?? d, error: null });
  }, []);
  const logout = useCallback(async () => {
    await api.auth.logout();
    setState({ status: "anonymous", user: null, error: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
