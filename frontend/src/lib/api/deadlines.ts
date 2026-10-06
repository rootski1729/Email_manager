"use client";

import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import { qk } from "./keys";
import type { EventCreate, EventItem, EventStatus, EventUpdate, MessageDetail } from "./types";

export interface EventFilters {
  status?: EventStatus[];
  from?: string;
  to?: string;
}

async function listEvents(filters: EventFilters): Promise<EventItem[]> {
  return unwrap(
    api.GET("/api/v1/deadlines", {
      params: { query: { status: filters.status, from: filters.from, to: filters.to, limit: 500 } },
    }),
  );
}

export const eventsQuery = (filters: EventFilters = {}) =>
  queryOptions({
    queryKey: qk.events({ ...filters }),
    queryFn: () => listEvents(filters),
    refetchInterval: 5 * 60_000,
  });

export const calendarFeedQuery = queryOptions({
  queryKey: qk.calendarFeed,
  queryFn: () => unwrap(api.GET("/api/v1/deadlines/calendar")),
  staleTime: Infinity,
});

function patchCaches(qc: QueryClient, event: EventItem) {
  qc.setQueriesData<EventItem[]>({ queryKey: qk.eventLists }, (old) =>
    old?.map((e) => (e.id === event.id ? event : e)),
  );
  if (event.message_id) {
    qc.setQueryData<MessageDetail>(qk.message(event.message_id), (old) =>
      old ? { ...old, events: old.events.map((e) => (e.id === event.id ? event : e)) } : old,
    );
  }
}

function refresh(qc: QueryClient, messageId?: string | null) {
  void qc.invalidateQueries({ queryKey: qk.eventLists });
  if (messageId) void qc.invalidateQueries({ queryKey: qk.message(messageId) });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: EventCreate) => unwrap(api.POST("/api/v1/deadlines", { body })),
    onSuccess: (event) => refresh(qc, event.message_id),
  });
}

export function useUpdateEvent(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: opts.silent },
    mutationFn: ({ id, body }: { id: string; body: EventUpdate }) =>
      unwrap(api.PATCH("/api/v1/deadlines/{event_id}", { params: { path: { event_id: id } }, body })),
    onMutate: async ({ id, body }) => {
      // Optimistic status changes (confirm / done / dismiss) so the timeline reacts instantly.
      if (!body.status || Object.keys(body).length !== 1) return undefined;
      await qc.cancelQueries({ queryKey: qk.eventLists });
      const previous = qc.getQueriesData<EventItem[]>({ queryKey: qk.eventLists });
      const status = body.status;
      qc.setQueriesData<EventItem[]>({ queryKey: qk.eventLists }, (old) =>
        old?.map((e) => (e.id === id ? { ...e, status } : e)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (event) => {
      patchCaches(qc, event);
      refresh(qc, event.message_id);
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; messageId?: string | null }) =>
      unwrap(api.DELETE("/api/v1/deadlines/{event_id}", { params: { path: { event_id: id } } })),
    onSuccess: (_d, { id, messageId }) => {
      qc.setQueriesData<EventItem[]>({ queryKey: qk.eventLists }, (old) => old?.filter((e) => e.id !== id));
      refresh(qc, messageId);
    },
  });
}

export function useRotateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/deadlines/calendar/rotate")),
    onSuccess: (feed) => qc.setQueryData(qk.calendarFeed, feed),
  });
}
