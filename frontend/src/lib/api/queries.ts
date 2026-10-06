"use client";

import type { ConditionJson } from "@/lib/rules/types";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, unwrap } from "./client";
import { qk } from "./keys";
import type {
  Destination,
  EmailTemplate,
  EmailTemplateCreate,
  EmailTemplateUpdate,
  OutboundStatus,
  ImapMailboxCreate,
  Mailbox,
  NotificationStatus,
  Rule,
  RuleCreate,
  RuleUpdate,
  SampleEmail,
  SettingsUpdate,
  UserUpdate,
  ImapCredentialsPatch,
} from "./types";

/* ----------------------------------------------------------------- queries */

export const meQuery = queryOptions({
  queryKey: qk.me,
  queryFn: () => unwrap(api.GET("/api/v1/me")),
  staleTime: 5 * 60_000,
});

export const settingsQuery = queryOptions({
  queryKey: qk.settings,
  queryFn: () => unwrap(api.GET("/api/v1/me/settings")),
});

export const overviewQuery = queryOptions({
  queryKey: qk.overview,
  queryFn: () => unwrap(api.GET("/api/v1/stats/overview")),
  refetchInterval: 60_000,
});

export const mailboxesQuery = queryOptions({
  queryKey: qk.mailboxes,
  queryFn: () => unwrap(api.GET("/api/v1/mailboxes")),
});

export const imapPresetsQuery = queryOptions({
  queryKey: qk.imapPresets,
  queryFn: () => unwrap(api.GET("/api/v1/mailboxes/imap/presets")),
  staleTime: Infinity,
});

export const mailboxConnectionQuery = (id: string) =>
  queryOptions({
    queryKey: qk.mailboxConnection(id),
    queryFn: () => unwrap(api.GET("/api/v1/mailboxes/{mailbox_id}/connection", { params: { path: { mailbox_id: id } } })),
    staleTime: 0,
  });

export const rulesQuery = queryOptions({
  queryKey: qk.rules,
  queryFn: () => unwrap(api.GET("/api/v1/rules")),
  select: (rules: Rule[]) => [...rules].sort((a, b) => a.position - b.position),
});

export const ruleQuery = (id: string) =>
  queryOptions({
    queryKey: qk.rule(id),
    queryFn: () => unwrap(api.GET("/api/v1/rules/{rule_id}", { params: { path: { rule_id: id } } })),
  });

export const ruleFieldsQuery = queryOptions({
  queryKey: qk.ruleFields,
  queryFn: () => unwrap(api.GET("/api/v1/rules/fields")),
  staleTime: Infinity,
});

export interface MessageFilters {
  mailbox_id?: string;
  rule_id?: string;
  q?: string;
}

export const messagesQuery = (filters: MessageFilters, limit = 30) =>
  infiniteQueryOptions({
    queryKey: qk.messages(filters),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/messages", {
          params: { query: { ...filters, cursor: pageParam ?? undefined, limit } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
  });

export const messageQuery = (id: string) =>
  queryOptions({
    queryKey: qk.message(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/messages/{message_id}", { params: { path: { message_id: id } } })),
  });

export const notificationsQuery = (status?: NotificationStatus) =>
  infiniteQueryOptions({
    queryKey: qk.notifications(status),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/notifications", {
          params: { query: { status: status ?? undefined, cursor: pageParam ?? undefined, limit: 30 } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
  });

export const destinationsQuery = queryOptions({
  queryKey: qk.destinations,
  queryFn: () => unwrap(api.GET("/api/v1/destinations")),
});

export const adminWahaQuery = queryOptions({
  queryKey: qk.adminWaha,
  queryFn: () => unwrap(api.GET("/api/v1/admin/waha")),
});

export const adminQueuesQuery = queryOptions({
  queryKey: qk.adminQueues,
  queryFn: () => unwrap(api.GET("/api/v1/admin/queues")),
  refetchInterval: 10_000,
});

export const templatesQuery = queryOptions({
  queryKey: qk.templates,
  queryFn: () => unwrap(api.GET("/api/v1/email-templates")),
});

export const templateQuery = (id: string) =>
  queryOptions({
    queryKey: qk.template(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/email-templates/{template_id}", { params: { path: { template_id: id } } })),
  });

export const templatePreviewQuery = (id: string) =>
  queryOptions({
    queryKey: qk.templatePreview(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/email-templates/{template_id}/preview", { params: { path: { template_id: id } } })),
  });

export const outboundQuery = (status?: OutboundStatus, limit = 30) =>
  infiniteQueryOptions({
    queryKey: [...qk.outbound(status), limit] as const,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/outbound-emails", {
          params: { query: { status: status ?? undefined, cursor: pageParam ?? undefined, limit } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? null,
  });

export const outboundEmailQuery = (id: string) =>
  queryOptions({
    queryKey: qk.outboundEmail(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/outbound-emails/{email_id}", { params: { path: { email_id: id } } })),
  });

export { useInfiniteQuery, useQuery };

/* --------------------------------------------------------------- mutations */

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserUpdate) => unwrap(api.PATCH("/api/v1/me", { body })),
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}

export function useUpdateSettings(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: opts.silent },
    mutationFn: (body: SettingsUpdate) => unwrap(api.PUT("/api/v1/me/settings", { body })),
    onSuccess: (settings) => qc.setQueryData(qk.settings, settings),
  });
}

export function useRevokeAllSessions() {
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/me/sessions/revoke-all")),
  });
}

function patchMailbox(qc: ReturnType<typeof useQueryClient>, mailbox: Mailbox) {
  qc.setQueryData<Mailbox[]>(qk.mailboxes, (old) =>
    old?.map((m) => (m.id === mailbox.id ? mailbox : m)),
  );
}

export function useUpdateMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; display_name?: string | null; paused?: boolean }) =>
      unwrap(api.PATCH("/api/v1/mailboxes/{mailbox_id}", { params: { path: { mailbox_id: id } }, body })),
    onSuccess: (mailbox) => {
      patchMailbox(qc, mailbox);
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useDeleteMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/mailboxes/{mailbox_id}", { params: { path: { mailbox_id: id } } })),
    onSuccess: (_d, id) => {
      qc.setQueryData<Mailbox[]>(qk.mailboxes, (old) => old?.filter((m) => m.id !== id));
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useSyncMailbox() {
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/mailboxes/{mailbox_id}/sync", { params: { path: { mailbox_id: id } } })),
  });
}

export function useConnectImap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImapMailboxCreate) => unwrap(api.POST("/api/v1/mailboxes/imap", { body })),
    onSuccess: (mailbox) => {
      qc.setQueryData<Mailbox[]>(qk.mailboxes, (old) => (old ? [...old, mailbox] : [mailbox]));
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useUpdateImapCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, credentials }: { id: string; credentials: ImapCredentialsPatch }) =>
      unwrap(
        api.PUT("/api/v1/mailboxes/{mailbox_id}/credentials", {
          params: { path: { mailbox_id: id } },
          body: { credentials },
        }),
      ),
    onSuccess: (mailbox) => {
      qc.setQueryData<Mailbox[]>(qk.mailboxes, (old) => old?.map((m) => (m.id === mailbox.id ? mailbox : m)));
      void qc.invalidateQueries({ queryKey: qk.mailboxConnection(mailbox.id) });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useGmailAuthorize() {
  return useMutation({
    mutationFn: ({ loginHint, send = false }: { loginHint?: string; send?: boolean } = {}) =>
      unwrap(
        api.POST("/api/v1/mailboxes/gmail/authorize", {
          params: { query: { send, ...(loginHint ? { login_hint: loginHint } : {}) } },
        }),
      ),
  });
}

export function useCreateRule(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: opts.silent },
    mutationFn: (body: RuleCreate) => unwrap(api.POST("/api/v1/rules", { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.rules });
      void qc.invalidateQueries({ queryKey: qk.overview });
      void qc.invalidateQueries({ queryKey: qk.onboarding });
    },
  });
}

export function useUpdateRule(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: opts.silent },
    mutationFn: ({ id, body }: { id: string; body: RuleUpdate }) =>
      unwrap(api.PATCH("/api/v1/rules/{rule_id}", { params: { path: { rule_id: id } }, body })),
    onMutate: async ({ id, body }) => {
      // Optimistic toggle for the enable switch in the list.
      if (body.enabled === undefined || Object.keys(body).length !== 1) return undefined;
      await qc.cancelQueries({ queryKey: qk.rules });
      const previous = qc.getQueryData<Rule[]>(qk.rules);
      qc.setQueryData<Rule[]>(qk.rules, (old) =>
        old?.map((r) => (r.id === id ? { ...r, enabled: Boolean(body.enabled) } : r)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.rules, ctx.previous);
    },
    onSuccess: (rule) => {
      qc.setQueryData(qk.rule(rule.id), rule);
      qc.setQueryData<Rule[]>(qk.rules, (old) => old?.map((r) => (r.id === rule.id ? rule : r)));
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/rules/{rule_id}", { params: { path: { rule_id: id } } })),
    onSuccess: (_d, id) => {
      qc.setQueryData<Rule[]>(qk.rules, (old) => old?.filter((r) => r.id !== id));
      qc.removeQueries({ queryKey: qk.rule(id) });
      void qc.invalidateQueries({ queryKey: qk.overview });
      // Deleting a starter-pack rule makes the pack installable again.
      void qc.invalidateQueries({ queryKey: qk.rulePacks });
      void qc.invalidateQueries({ queryKey: qk.onboarding });
    },
  });
}

export function useReorderRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(api.PUT("/api/v1/rules/order", { body: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.rules });
      const previous = qc.getQueryData<Rule[]>(qk.rules);
      if (previous) {
        const byId = new Map(previous.map((r) => [r.id, r]));
        qc.setQueryData<Rule[]>(
          qk.rules,
          ids.flatMap((id, position) => {
            const r = byId.get(id);
            return r ? [{ ...r, position }] : [];
          }),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.rules, ctx.previous);
    },
    onSuccess: (rules) => qc.setQueryData(qk.rules, rules),
  });
}

export function useTestRule() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: {
      condition: ConditionJson;
      mailbox_id?: string | null;
      sample?: SampleEmail | null;
      limit?: number;
    }) => unwrap(api.POST("/api/v1/rules/test", { body: { ...body, limit: body.limit ?? 20 } })),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/messages/{message_id}", { params: { path: { message_id: id } } })),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.message(id) });
      void qc.invalidateQueries({ queryKey: qk.messagesAll });
    },
  });
}

export function useRetryNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/v1/notifications/{notification_id}/retry", {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notificationsAll });
      void qc.invalidateQueries({ queryKey: ["messages", "detail"] });
      void qc.invalidateQueries({ queryKey: qk.adminQueues });
    },
  });
}

function upsertDestination(qc: ReturnType<typeof useQueryClient>, d: Destination) {
  qc.setQueryData<Destination[]>(qk.destinations, (old) => {
    if (!old) return [d];
    const exists = old.some((x) => x.id === d.id);
    const next = exists ? old.map((x) => (x.id === d.id ? d : x)) : [...old, d];
    return d.is_default ? next.map((x) => ({ ...x, is_default: x.id === d.id })) : next;
  });
}

export function useAddDestination() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { phone: string; label: string }) =>
      unwrap(api.POST("/api/v1/destinations", { body })),
    onSuccess: (d) => upsertDestination(qc, d),
  });
}

export function useVerifyDestination() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      unwrap(
        api.POST("/api/v1/destinations/{destination_id}/verify", {
          params: { path: { destination_id: id } },
          body: { code },
        }),
      ),
    onSuccess: (d) => upsertDestination(qc, d),
  });
}

export function useResendDestinationCode() {
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/v1/destinations/{destination_id}/resend", {
          params: { path: { destination_id: id } },
        }),
      ),
  });
}

export function useUpdateDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; label?: string; is_default?: boolean }) =>
      unwrap(
        api.PATCH("/api/v1/destinations/{destination_id}", {
          params: { path: { destination_id: id } },
          body,
        }),
      ),
    onSuccess: (d) => upsertDestination(qc, d),
  });
}

export function useDeleteDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/destinations/{destination_id}", {
          params: { path: { destination_id: id } },
        }),
      ),
    onSuccess: (_d, id) =>
      qc.setQueryData<Destination[]>(qk.destinations, (old) => old?.filter((x) => x.id !== id)),
  });
}

export function useStartGroupLink() {
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/destinations/group-link")),
  });
}

export type WahaAction = "start" | "restart" | "logout";

export function useWahaAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: WahaAction) =>
      unwrap(api.POST("/api/v1/admin/waha/{action}", { params: { path: { action } } })),
    onSuccess: (session) => qc.setQueryData(qk.adminWaha, session),
  });
}

/* ------------------------------------------------------- email templates */

function upsertTemplate(qc: ReturnType<typeof useQueryClient>, t: EmailTemplate) {
  qc.setQueryData(qk.template(t.id), t);
  qc.setQueryData<EmailTemplate[]>(qk.templates, (old) => {
    if (!old) return old;
    const next = old.some((x) => x.id === t.id) ? old.map((x) => (x.id === t.id ? t : x)) : [...old, t];
    return t.is_default ? next.map((x) => ({ ...x, is_default: x.id === t.id })) : next;
  });
  void qc.invalidateQueries({ queryKey: qk.templatePreview(t.id) });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: EmailTemplateCreate) => unwrap(api.POST("/api/v1/email-templates", { body })),
    onSuccess: (t) => {
      upsertTemplate(qc, t);
      void qc.invalidateQueries({ queryKey: qk.templates });
    },
  });
}

export function useUpdateTemplate(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: opts.silent },
    mutationFn: ({ id, body }: { id: string; body: EmailTemplateUpdate }) =>
      unwrap(api.PATCH("/api/v1/email-templates/{template_id}", { params: { path: { template_id: id } }, body })),
    onSuccess: (t) => upsertTemplate(qc, t),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/email-templates/{template_id}", { params: { path: { template_id: id } } })),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.template(id) });
      qc.removeQueries({ queryKey: qk.templatePreview(id) });
      // The backend may promote another template to default.
      void qc.invalidateQueries({ queryKey: qk.templates });
    },
  });
}

/* --------------------------------------------------------- outbound email */

export function useCancelOutbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/outbound-emails/{email_id}/cancel", { params: { path: { email_id: id } } })),
    onSuccess: (email) => {
      qc.setQueryData(qk.outboundEmail(email.id), email);
      void qc.invalidateQueries({ queryKey: qk.outboundAll });
    },
  });
}
