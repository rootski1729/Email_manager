"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import { qk } from "./keys";
import type { ChatTurn, OutboundCreate } from "./types";

/* AI assistant (Azure AI Foundry). Nothing here sends email except useSendEmail. */

export const aiStatusQuery = queryOptions({
  queryKey: qk.aiStatus,
  queryFn: () => unwrap(api.GET("/api/v1/ai/status")),
  staleTime: 5 * 60_000,
});

/** True only when the admin has set AI up and it is switched on for this user. */
export function useAiAvailable() {
  const status = useQuery(aiStatusQuery);
  return status.data?.available ?? false;
}

/**
 * Three reply ideas for a message, optionally steered by `guidance` ("politely decline").
 * A POST, but loaded like a query so it runs once per open panel and per guidance.
 */
export const replyIdeasQuery = (messageId: string, guidance = "") =>
  queryOptions({
    queryKey: qk.aiReplyIdeas(messageId, guidance),
    queryFn: () =>
      unwrap(
        api.POST("/api/v1/messages/{message_id}/ai/replies", {
          params: { path: { message_id: messageId } },
          body: guidance ? { guidance } : undefined,
        }),
      ),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

export function useDraftReply() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ messageId, instructions }: { messageId: string; instructions: string }) =>
      unwrap(
        api.POST("/api/v1/messages/{message_id}/ai/draft", {
          params: { path: { message_id: messageId } },
          body: { instructions },
        }),
      ),
  });
}

/** Ask about one email (and its earlier thread). `history` is the recent conversation, oldest first. */
export function useAskEmail() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ messageId, question, history }: { messageId: string; question: string; history: ChatTurn[] }) =>
      unwrap(
        api.POST("/api/v1/messages/{message_id}/ai/ask", {
          params: { path: { message_id: messageId } },
          body: { question, history },
        }),
      ),
  });
}

/** An empty reply (sender, To and "Re:" subject filled in) to write by hand. No AI; nothing is sent. */
export function useBlankReply() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (messageId: string) =>
      unwrap(api.POST("/api/v1/messages/{message_id}/reply-draft", { params: { path: { message_id: messageId } } })),
  });
}

export function useComposeDraft() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (instructions: string) => unwrap(api.POST("/api/v1/ai/compose", { body: { instructions } })),
  });
}

export function useReviseDraft() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: {
      to: string[];
      cc: string[];
      subject: string;
      body: string;
      reply_to_message_id: string | null;
      instructions: string;
    }) => unwrap(api.POST("/api/v1/ai/revise", { body })),
  });
}

export function useRuleFromText() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (description: string) => unwrap(api.POST("/api/v1/ai/rule", { body: { description } })),
  });
}

export function useAskMail() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (question: string) => unwrap(api.POST("/api/v1/ai/ask", { body: { question } })),
  });
}

/** Actually sends: queues the email from the user's own mailbox. */
export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OutboundCreate) => unwrap(api.POST("/api/v1/outbound-emails", { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.outboundAll }),
  });
}
