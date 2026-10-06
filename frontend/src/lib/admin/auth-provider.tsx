"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { ak } from "./keys";
import {
  adminLogout,
  adminSession,
  bootstrapAdminSession,
  setAdminSession,
  type AdminSessionStatus,
} from "./session";
import type { AdminOut, AdminTokenOut } from "./types";

interface AdminAuthValue {
  status: AdminSessionStatus;
  admin: AdminOut | null;
  signIn: (tokens: AdminTokenOut) => void;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const state = useSyncExternalStore(adminSession.subscribe, adminSession.getSnapshot, adminSession.getServerSnapshot);

  useEffect(() => {
    void bootstrapAdminSession();
  }, []);

  // Drop cached admin data whenever the admin session ends.
  useEffect(() => {
    if (state.status === "anonymous") qc.removeQueries({ queryKey: ak.all });
  }, [state.status, qc]);

  const signIn = useCallback((tokens: AdminTokenOut) => setAdminSession(tokens), []);
  const signOut = useCallback(() => adminLogout(), []);

  const value = useMemo<AdminAuthValue>(
    () => ({ status: state.status, admin: state.admin, signIn, signOut }),
    [state.status, state.admin, signIn, signOut],
  );
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
}
