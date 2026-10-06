"use client";

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import { qk } from "./keys";
import type { MuteScope, Onboarding, RemindRequest, Settings } from "./types";

/* ------------------------------------------------------------ onboarding */

export const onboardingQuery = queryOptions({
  queryKey: qk.onboarding,
  queryFn: () => unwrap(api.GET("/api/v1/me/onboarding")),
});

export function useDismissOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/me/onboarding/dismiss")),
    onMutate: () => {
      const previous = qc.getQueryData<Onboarding>(qk.onboarding);
      qc.setQueryData<Onboarding>(qk.onboarding, (old) => (old ? { ...old, dismissed: true } : old));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.onboarding, ctx.previous);
    },
  });
}

export function useTestAlert() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: () => unwrap(api.POST("/api/v1/me/test-alert")),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.onboarding });
      void qc.invalidateQueries({ queryKey: qk.notificationsAll });
    },
  });
}

/* --------------------------------------------------------- alert actions */

export function useRemindMessage() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, ...body }: { id: string } & RemindRequest) =>
      unwrap(api.POST("/api/v1/messages/{message_id}/remind", { params: { path: { message_id: id } }, body })),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.message(id) });
      void qc.invalidateQueries({ queryKey: qk.notificationsAll });
    },
  });
}

export function useMuteSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: MuteScope }) =>
      unwrap(api.POST("/api/v1/messages/{message_id}/mute", { params: { path: { message_id: id } }, body: { scope } })),
    onSuccess: (out) =>
      qc.setQueryData<Settings>(qk.settings, (old) => (old ? { ...old, muted_senders: out.muted_senders } : old)),
  });
}
