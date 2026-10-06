"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { meQuery } from "@/lib/api/queries";
import type { TokenOut, User } from "@/lib/api/types";
import { bootstrapSession, logout, session, setSession, type SessionStatus } from "./session";

interface AuthContextValue {
  status: SessionStatus;
  user: User | undefined;
  signIn: (token: TokenOut) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  // The admin console has its own session; don't restore or clear the client one there.
  const inAdmin = usePathname()?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (!inAdmin) void bootstrapSession();
  }, [inAdmin]);

  // Drop cached client data whenever the client session ends (logout, expiry, other tab).
  useEffect(() => {
    if (state.status === "anonymous" && !inAdmin) qc.clear();
  }, [state.status, qc, inAdmin]);

  const me = useQuery({ ...meQuery, enabled: state.status === "authenticated" });

  const signIn = useCallback((token: TokenOut) => {
    setSession(token.access_token, token.expires_in);
  }, []);

  const signOut = useCallback(async () => {
    await logout();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: me.data,
      signIn,
      signOut,
    }),
    [state.status, me.data, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
