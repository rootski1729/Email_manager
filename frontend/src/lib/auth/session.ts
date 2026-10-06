/**
 * In-memory session store. The access token never touches localStorage or
 * cookies; the long-lived refresh token is an httpOnly cookie (`ms_refresh`)
 * scoped to /api/v1/auth that this code never sees.
 */

export type SessionStatus = "restoring" | "authenticated" | "anonymous";

export type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; reason: "unauthorized" | "network" };

interface State {
  status: SessionStatus;
  token: string | null;
  expiresAt: number;
}

const REFRESH_PATH = "/api/v1/auth/refresh";
const LOGOUT_PATH = "/api/v1/auth/logout";
const REFRESH_LEAD_MS = 60_000;
const CHANNEL = "mailsentinel-auth";

let state: State = { status: "restoring", token: null, expiresAt: 0 };
const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<RefreshResult> | null = null;
let bootstrapPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: State) {
  state = next;
  emit();
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev: MessageEvent<{ type: string }>) => {
      if (ev.data?.type === "logout") clearSession(false);
    };
  }
  return channel;
}

function schedule(expiresInS: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(5_000, expiresInS * 1000 - REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken();
  }, delay);
}

export const session = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): State {
    return state;
  },
  getServerSnapshot(): State {
    return SERVER_STATE;
  },
  getToken(): string | null {
    return state.token;
  },
};

const SERVER_STATE: State = { status: "restoring", token: null, expiresAt: 0 };

export function setSession(accessToken: string, expiresInS: number) {
  getChannel();
  setState({
    status: "authenticated",
    token: accessToken,
    expiresAt: Date.now() + expiresInS * 1000,
  });
  schedule(expiresInS);
}

export function clearSession(broadcast = true) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  setState({ status: "anonymous", token: null, expiresAt: 0 });
  if (broadcast) getChannel()?.postMessage({ type: "logout" });
}

async function doRefresh(): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(REFRESH_PATH, { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.ok) {
    const body = (await res.json()) as { access_token: string; expires_in: number };
    setSession(body.access_token, body.expires_in);
    return { ok: true, token: body.access_token };
  }
  if (res.status === 401 || res.status === 403 || res.status === 422) {
    clearSession(false);
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: false, reason: "network" };
}

/**
 * Single-flight refresh. Concurrent callers share one promise; across tabs a
 * Web Lock serialises the call so rotating refresh tokens are never replayed
 * (the backend revokes the whole token family on reuse).
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const startedWith = state.token;
  const run = async (): Promise<RefreshResult> => {
    // Another tab may have refreshed while we waited for the lock; our cookie
    // is already rotated, so a fresh call is still safe and required here.
    if (state.token && state.token !== startedWith) return { ok: true, token: state.token };
    return doRefresh();
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  inflight = (locks ? locks.request("mailsentinel-refresh", run) : run()).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Restore a session from the refresh cookie once per page load. */
export function bootstrapSession(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = refreshAccessToken().then((r) => {
      if (!r.ok) clearSession(false);
    });
  }
  return bootstrapPromise;
}

export async function logout(): Promise<void> {
  try {
    await fetch(LOGOUT_PATH, {
      method: "POST",
      credentials: "include",
      headers: state.token ? { Authorization: `Bearer ${state.token}` } : undefined,
    });
  } catch {
    // Signing out locally is still correct when the network is down.
  }
  clearSession(true);
}
