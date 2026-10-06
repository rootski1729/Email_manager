/**
 * Admin console session store, completely separate from the client session
 * in `@/lib/auth/session`. The access token lives only in memory; the refresh
 * token is the httpOnly `ms_admin` cookie scoped to /api/v1/admin/auth.
 */

import type { AdminOut, AdminTokenOut } from "./types";

export type AdminSessionStatus = "restoring" | "authenticated" | "anonymous";

export type AdminRefreshResult = { ok: true; token: string } | { ok: false; reason: "unauthorized" | "network" };

export interface AdminSessionState {
  status: AdminSessionStatus;
  token: string | null;
  expiresAt: number;
  admin: AdminOut | null;
}

const REFRESH_PATH = "/api/v1/admin/auth/refresh";
const LOGOUT_PATH = "/api/v1/admin/auth/logout";
const REFRESH_LEAD_MS = 60_000;
const CHANNEL = "mailsentinel-admin-auth";
const LOCK = "mailsentinel-admin-refresh";

const SERVER_STATE: AdminSessionState = { status: "restoring", token: null, expiresAt: 0, admin: null };

let state: AdminSessionState = SERVER_STATE;
const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<AdminRefreshResult> | null = null;
let bootstrapPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;

function setState(next: AdminSessionState) {
  state = next;
  listeners.forEach((l) => l());
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev: MessageEvent<{ type: string }>) => {
      if (ev.data?.type === "logout") clearAdminSession(false);
    };
  }
  return channel;
}

function schedule(expiresInS: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(5_000, expiresInS * 1000 - REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    void refreshAdminToken();
  }, delay);
}

export const adminSession = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): AdminSessionState {
    return state;
  },
  getServerSnapshot(): AdminSessionState {
    return SERVER_STATE;
  },
  getToken(): string | null {
    return state.token;
  },
};

export function setAdminSession(tokens: Pick<AdminTokenOut, "access_token" | "expires_in" | "admin">) {
  getChannel();
  setState({
    status: "authenticated",
    token: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    admin: tokens.admin,
  });
  schedule(tokens.expires_in);
}

/** Keep the cached admin profile in sync after a profile change. */
export function updateAdminProfile(admin: AdminOut) {
  if (state.status === "authenticated") setState({ ...state, admin });
}

export function clearAdminSession(broadcast = true) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  setState({ status: "anonymous", token: null, expiresAt: 0, admin: null });
  if (broadcast) getChannel()?.postMessage({ type: "logout" });
}

async function doRefresh(): Promise<AdminRefreshResult> {
  let res: Response;
  try {
    res = await fetch(REFRESH_PATH, { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.ok) {
    const body = (await res.json()) as AdminTokenOut;
    setAdminSession(body);
    return { ok: true, token: body.access_token };
  }
  if (res.status === 401 || res.status === 403 || res.status === 422) {
    clearAdminSession(false);
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: false, reason: "network" };
}

/**
 * Single-flight refresh. Concurrent callers share one promise; across tabs a
 * Web Lock serialises the call so a rotated refresh cookie is never replayed.
 */
export function refreshAdminToken(): Promise<AdminRefreshResult> {
  if (inflight) return inflight;
  const startedWith = state.token;
  const run = async (): Promise<AdminRefreshResult> => {
    if (state.token && state.token !== startedWith) return { ok: true, token: state.token };
    return doRefresh();
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  inflight = (locks ? locks.request(LOCK, run) : run()).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Restore the admin session from the refresh cookie once per page load. */
export function bootstrapAdminSession(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = refreshAdminToken().then((r) => {
      if (!r.ok) clearAdminSession(false);
    });
  }
  return bootstrapPromise;
}

export async function adminLogout(): Promise<void> {
  try {
    await fetch(LOGOUT_PATH, {
      method: "POST",
      credentials: "include",
      headers: state.token ? { Authorization: `Bearer ${state.token}` } : undefined,
    });
  } catch {
    // Signing out locally is still right when the network is down.
  }
  clearAdminSession(true);
}
