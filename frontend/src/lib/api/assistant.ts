"use client";

import { useMutation } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import type { StreamPayload } from "./stream";
import type { Draft } from "./types";

/*
 * The mail assistant: find any email by describing it, narrow it down, open it or reply.
 * POST /assistant/chat streams `conversation`, `status`, `results`, `delta`…, then `done` (or `error`).
 */

export const ASSISTANT_CHAT_URL = "/api/v1/assistant/chat";

export interface AssistantChatBody {
  message: string;
  conversation_id?: string | null;
}

/** One numbered match, as shown on a result card. */
export interface AssistantResult {
  n: number;
  from_name: string;
  from_address: string;
  subject: string;
  /** ISO date. */
  date: string;
  snippet: string;
  /** The mailbox's address. */
  mailbox: string;
  has_attachments: boolean;
}

/** An email the assistant kept for the person: viewable at /messages/{message_id}. */
export interface AssistantOpened {
  message_id: string;
  code: string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The `results` items, with anything malformed dropped. */
export function resultsOf(data: StreamPayload): AssistantResult[] {
  if (!Array.isArray(data.items)) return [];
  return data.items.flatMap((raw): AssistantResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.n !== "number") return [];
    return [
      {
        n: r.n,
        from_name: str(r.from_name),
        from_address: str(r.from_address),
        subject: str(r.subject),
        date: str(r.date),
        snippet: str(r.snippet),
        mailbox: str(r.mailbox),
        has_attachments: r.has_attachments === true,
      },
    ];
  });
}

export function openedOf(data: StreamPayload): AssistantOpened[] {
  if (!Array.isArray(data.opened)) return [];
  return data.opened.flatMap((raw): AssistantOpened[] => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    return typeof o.message_id === "string"
      ? [{ message_id: o.message_id, code: typeof o.code === "string" ? o.code : null }]
      : [];
  });
}

export function draftOf(data: StreamPayload): Draft | null {
  const d = data.draft;
  if (!d || typeof d !== "object") return null;
  const draft = d as Record<string, unknown>;
  if (typeof draft.mailbox_id !== "string" || typeof draft.from_address !== "string") return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((a): a is string => typeof a === "string") : []);
  return {
    mailbox_id: draft.mailbox_id,
    from_address: draft.from_address,
    to: list(draft.to),
    cc: list(draft.cc),
    subject: str(draft.subject),
    body: str(draft.body),
    reply_to_message_id: typeof draft.reply_to_message_id === "string" ? draft.reply_to_message_id : null,
  };
}

/** Open result `n`: the email is kept (gets a #code) so it can be viewed at /messages/{message_id}. */
export function useOpenResult() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ conversationId, n }: { conversationId: string; n: number }) =>
      unwrap(
        api.POST("/api/v1/assistant/conversations/{conversation_id}/results/{n}/open", {
          params: { path: { conversation_id: conversationId, n } },
        }),
      ),
  });
}

/** End a conversation ("New chat"). Best effort: it expires by itself anyway. */
export async function endConversation(conversationId: string): Promise<void> {
  try {
    await api.DELETE("/api/v1/assistant/conversations/{conversation_id}", {
      params: { path: { conversation_id: conversationId } },
    });
  } catch {
    // Nothing to do: the conversation times out on the server.
  }
}
