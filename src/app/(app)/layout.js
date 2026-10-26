"use client";
import AppShell from "@/components/AppShell";
import { DataProvider } from "@/lib/store";
import { useAuth } from "@/lib/auth";

// The data layer only mounts once the user is authenticated; the server must still
// enforce access on every API call (this guard is for user experience only).
function Gate({ children }) {
  const { status } = useAuth();
  return status === "authenticated" ? <DataProvider><AppShell>{children}</AppShell></DataProvider> : <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }) {
  return <Gate>{children}</Gate>;
}
