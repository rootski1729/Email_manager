"use client";

import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import { qk } from "./keys";
import type { RulePack, SenderRuleCreate, Suggestions } from "./types";

export const rulePacksQuery = queryOptions({
  queryKey: qk.rulePacks,
  queryFn: () => unwrap(api.GET("/api/v1/rules/packs")),
  staleTime: 5 * 60_000,
});

/** Reads recent mail headers on the server (a few seconds; cached there for 10 minutes). */
export const ruleSuggestionsQuery = (mailboxId: string) =>
  queryOptions({
    queryKey: qk.ruleSuggestions(mailboxId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/rules/suggestions", { params: { query: { mailbox_id: mailboxId } } })),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

function afterRuleCreated(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.rules });
  void qc.invalidateQueries({ queryKey: qk.overview });
  void qc.invalidateQueries({ queryKey: qk.onboarding });
}

export function useInstallPack() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, mailboxIds }: { id: string; mailboxIds?: string[] | null }) =>
      unwrap(
        api.POST("/api/v1/rules/packs/{pack_id}/install", {
          params: { path: { pack_id: id } },
          body: mailboxIds?.length ? { mailbox_ids: mailboxIds } : null,
        }),
      ),
    onSuccess: (_rule, { id }) => {
      qc.setQueryData<RulePack[]>(qk.rulePacks, (old) => old?.map((p) => (p.id === id ? { ...p, installed: true } : p)));
      qc.setQueriesData<Suggestions>({ queryKey: ["rule-suggestions"] }, (old) =>
        old ? { ...old, packs: old.packs.filter((s) => s.pack.id !== id) } : old,
      );
      void qc.invalidateQueries({ queryKey: qk.rulePacks });
      afterRuleCreated(qc);
    },
  });
}

export function useRuleFromSender() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: SenderRuleCreate) => unwrap(api.POST("/api/v1/rules/from-sender", { body })),
    onSuccess: (_rule, { domain }) => {
      qc.setQueriesData<Suggestions>({ queryKey: ["rule-suggestions"] }, (old) =>
        old ? { ...old, senders: old.senders.filter((s) => s.domain !== domain) } : old,
      );
      afterRuleCreated(qc);
    },
  });
}
