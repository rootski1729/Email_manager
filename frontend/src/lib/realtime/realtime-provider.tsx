"use client";

import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { qk } from "@/lib/api/keys";
import type {
  EmailUpdatedEvent,
  Mailbox,
  MailboxUpdatedEvent,
  MessageMatchedEvent,
  RealtimeEventMap,
  RealtimeEventName,
} from "@/lib/api/types";
import { refreshAccessToken, session } from "@/lib/auth/session";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "offline";

type Handler<K extends RealtimeEventName> = (data: RealtimeEventMap[K]) => void;

interface RealtimeContextValue {
  connection: ConnectionState;
  feed: (MessageMatchedEvent & { key: string })[];
  subscribe: <K extends RealtimeEventName>(event: K, handler: Handler<K>) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

class AuthRequired extends Error {}
class RetryLater extends Error {}

const EVENTS_URL = "/api/v1/events";
const FEED_LIMIT = 25;
const MAX_BACKOFF_MS = 30_000;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}

export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [feed, setFeed] = useState<RealtimeContextValue["feed"]>([]);
  const handlers = useRef(new Map<string, Set<(data: unknown) => void>>());

  const subscribe = useCallback(<K extends RealtimeEventName>(event: K, handler: Handler<K>) => {
    const set = handlers.current.get(event) ?? new Set();
    set.add(handler as (data: unknown) => void);
    handlers.current.set(event, set);
    return () => {
      set.delete(handler as (data: unknown) => void);
    };
  }, []);

  const dispatch = useCallback(
    (event: string, raw: string) => {
      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return;
      }
      switch (event as RealtimeEventName) {
        case "message.matched": {
          const m = data as MessageMatchedEvent;
          setFeed((prev) =>
            [{ ...m, key: `${m.message_id}-${prev.length}-${Math.random().toString(36).slice(2, 6)}` }, ...prev].slice(
              0,
              FEED_LIMIT,
            ),
          );
          void qc.invalidateQueries({ queryKey: qk.messagesAll });
          void qc.invalidateQueries({ queryKey: qk.overview });
          void qc.invalidateQueries({ queryKey: qk.rules });
          // New important mail may carry dates for the deadline radar, and completes onboarding steps.
          void qc.invalidateQueries({ queryKey: qk.eventLists });
          void qc.invalidateQueries({ queryKey: qk.onboarding });
          toast(`${m.urgent ? "Urgent: " : ""}${m.subject || "(no subject)"}`, {
            id: `match-${m.message_id}`,
            description: `${m.ref ? `#${m.ref} · ` : ""}${m.from_name || m.from_address}${m.rules?.length ? ` · ${m.rules.join(", ")}` : ""}`,
            action: { label: "Open", onClick: () => router.push(`/messages/${m.message_id}`) },
          });
          break;
        }
        case "notification.updated":
          void qc.invalidateQueries({ queryKey: qk.notificationsAll });
          void qc.invalidateQueries({ queryKey: ["messages", "detail"] });
          void qc.invalidateQueries({ queryKey: qk.overview });
          break;
        case "mailbox.updated": {
          const u = data as MailboxUpdatedEvent;
          qc.setQueryData<Mailbox[]>(qk.mailboxes, (old) =>
            old?.map((mb) =>
              mb.id === u.id
                ? {
                    ...mb,
                    ...(u.status ? { status: u.status } : {}),
                    ...("last_error" in u ? { last_error: u.last_error ?? null } : {}),
                    ...(u.last_synced_at ? { last_synced_at: u.last_synced_at, last_error: null } : {}),
                  }
                : mb,
            ),
          );
          void qc.invalidateQueries({ queryKey: qk.mailboxes });
          void qc.invalidateQueries({ queryKey: qk.overview });
          break;
        }
        case "email.updated": {
          const e = data as EmailUpdatedEvent;
          void qc.invalidateQueries({ queryKey: qk.outboundAll });
          if (e.status === "sent") {
            toast.success("Email sent", {
              id: `email-${e.id}`,
              description: "Your email from WhatsApp went out.",
              action: { label: "View", onClick: () => router.push(`/sent?email=${e.id}`) },
            });
          } else if (e.status === "failed") {
            toast.error("Email couldn't be sent", {
              id: `email-${e.id}`,
              description: "Open it to see what went wrong.",
              action: { label: "View", onClick: () => router.push(`/sent?email=${e.id}`) },
            });
          }
          break;
        }
        case "destination.linked":
          void qc.invalidateQueries({ queryKey: qk.destinations });
          break;
        case "system":
          void qc.invalidateQueries({ queryKey: qk.adminWaha });
          void qc.invalidateQueries({ queryKey: qk.overview });
          break;
        default:
          break;
      }
      handlers.current.get(event)?.forEach((h) => h(data));
    },
    [qc, router],
  );

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    let attempt = 0;

    const run = async () => {
      while (!ctrl.signal.aborted) {
        const token = session.getToken();
        if (!token) {
          const r = await refreshAccessToken();
          if (!r.ok) {
            setConnection("offline");
            if (r.reason === "unauthorized") return;
            await wait(Math.min(MAX_BACKOFF_MS, 2000 * 2 ** attempt++), ctrl.signal);
            continue;
          }
        }
        try {
          await fetchEventSource(EVENTS_URL, {
            signal: ctrl.signal,
            openWhenHidden: true,
            credentials: "include",
            headers: { Authorization: `Bearer ${session.getToken() ?? ""}`, Accept: EventStreamContentType },
            async onopen(res) {
              if (res.ok && res.headers.get("content-type")?.includes(EventStreamContentType)) {
                attempt = 0;
                setConnection("open");
                return;
              }
              if (res.status === 401) throw new AuthRequired();
              throw new RetryLater(`events: HTTP ${res.status}`);
            },
            onmessage(ev) {
              if (ev.event) dispatch(ev.event, ev.data);
            },
            onclose() {
              throw new RetryLater("events: stream closed");
            },
            onerror(err) {
              // Stop the library's own retry loop; this loop owns backoff.
              throw err;
            },
          });
        } catch (err) {
          if (ctrl.signal.aborted) return;
          if (err instanceof AuthRequired) {
            const r = await refreshAccessToken();
            if (!r.ok && r.reason === "unauthorized") {
              setConnection("offline");
              return;
            }
          }
        }
        if (ctrl.signal.aborted) return;
        setConnection("reconnecting");
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 1000;
        attempt += 1;
        await wait(delay, ctrl.signal);
        // Catch up on anything missed while disconnected.
        void qc.invalidateQueries({ queryKey: qk.overview });
      }
    };
    void run();
    return () => ctrl.abort();
  }, [enabled, dispatch, qc]);

  const value = useMemo(() => ({ connection, feed, subscribe }), [connection, feed, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

/** Subscribe to one realtime event for the lifetime of the component. */
export function useRealtimeEvent<K extends RealtimeEventName>(event: K, handler: Handler<K>) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe(event, (d) => ref.current(d)), [event, subscribe]);
}
