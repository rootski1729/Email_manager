"use client";

import { keepPreviousData, queryOptions, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { adminApi, unwrap } from "./client";
import { ak } from "./keys";
import type {
  AdminCreate,
  AdminUpdate,
  ClientCreate,
  ClientUpdate,
  AIConfigIn,
  GoogleConfigIn,
  MailboxAction,
  MailboxStatus,
  NotificationStatus,
  ToolDates,
  ToolMailbox,
  ToolRuleTest,
  WahaAction,
} from "./types";

/* ----------------------------------------------------------------- queries */

export const overviewQuery = queryOptions({
  queryKey: ak.overview,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/overview")),
  refetchInterval: 60_000,
});

export const wahaQuery = queryOptions({
  queryKey: ak.waha,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/waha")),
});

export function notificationsQuery(status: NotificationStatus | null, limit = 50) {
  return queryOptions({
    queryKey: [...ak.notifications(status), limit],
    queryFn: () =>
      unwrap(adminApi.GET("/api/v1/admin/notifications", { params: { query: { status, limit } } })),
  });
}

export function auditQuery(limit: number) {
  return queryOptions({
    queryKey: ak.audit(limit),
    queryFn: () => unwrap(adminApi.GET("/api/v1/admin/audit", { params: { query: { limit } } })),
    placeholderData: keepPreviousData,
  });
}

export interface ClientListParams {
  q: string;
  status: "active" | "disabled" | null;
  plan: string | null;
  offset: number;
  limit: number;
}

export function clientsQuery(p: ClientListParams) {
  return queryOptions({
    queryKey: ak.clientList({ ...p }),
    queryFn: () =>
      unwrap(
        adminApi.GET("/api/v1/admin/clients", {
          params: { query: { q: p.q || null, status: p.status, plan: p.plan, offset: p.offset, limit: p.limit } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function clientQuery(id: string) {
  return queryOptions({
    queryKey: ak.client(id),
    queryFn: () => unwrap(adminApi.GET("/api/v1/admin/clients/{client_id}", { params: { path: { client_id: id } } })),
  });
}

export function mailboxesQuery(p: { status: MailboxStatus | null; q: string }) {
  return queryOptions({
    queryKey: ak.mailboxList({ ...p }),
    queryFn: () =>
      unwrap(adminApi.GET("/api/v1/admin/mailboxes", { params: { query: { status: p.status, q: p.q || null } } })),
    placeholderData: keepPreviousData,
  });
}

export function rulesQuery(p: { q: string; clientId: string | null }) {
  return queryOptions({
    queryKey: ak.ruleList({ ...p }),
    queryFn: () =>
      unwrap(adminApi.GET("/api/v1/admin/rules", { params: { query: { q: p.q || null, client_id: p.clientId } } })),
    placeholderData: keepPreviousData,
  });
}

export function ruleQuery(id: string) {
  return queryOptions({
    queryKey: [...ak.rules, "detail", id] as const,
    queryFn: () => unwrap(adminApi.GET("/api/v1/admin/rules/{rule_id}", { params: { path: { rule_id: id } } })),
  });
}

export const googleQuery = queryOptions({
  queryKey: ak.google,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/config/google")),
});

export const aiConfigQuery = queryOptions({
  queryKey: ak.ai,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/config/ai")),
});

export const adminsQuery = queryOptions({
  queryKey: ak.admins,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/admins")),
});

export const dbTablesQuery = queryOptions({
  queryKey: ak.dbTables,
  queryFn: () => unwrap(adminApi.GET("/api/v1/admin/db/tables")),
  staleTime: 60_000,
});

export interface DbRowsParams {
  q: string;
  order: string | null;
  desc: boolean;
  offset: number;
  limit: number;
}

export function dbRowsQuery(table: string, p: DbRowsParams) {
  return queryOptions({
    queryKey: ak.dbRows(table, { ...p }),
    queryFn: () =>
      unwrap(
        adminApi.GET("/api/v1/admin/db/{table_name}", {
          params: {
            path: { table_name: table },
            query: { q: p.q || null, order: p.order, desc: p.desc, offset: p.offset, limit: p.limit },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/* --------------------------------------------------------------- mutations */

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Anything touching a client's data refreshes the lists, the detail page and the overview. */
const CLIENT_DATA: QueryKey[] = [ak.clients, ak.mailboxes, ak.rules, ak.overview, ["admin", "db"]];

export function useWahaAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: WahaAction) =>
      unwrap(adminApi.POST("/api/v1/admin/waha/{action}", { params: { path: { action } } })),
    onSuccess: (data) => {
      qc.setQueryData(ak.waha, data);
      void qc.invalidateQueries({ queryKey: ak.overview });
    },
  });
}

export function useRetryNotification() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        adminApi.POST("/api/v1/admin/notifications/{notification_id}/retry", {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () => invalidate(["admin", "notifications"], ak.clients, ak.overview),
  });
}

export function useCreateClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ClientCreate) => unwrap(adminApi.POST("/api/v1/admin/clients", { body })),
    onSuccess: () => invalidate(...CLIENT_DATA),
  });
}

export function useUpdateClient(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ClientUpdate) =>
      unwrap(adminApi.PATCH("/api/v1/admin/clients/{client_id}", { params: { path: { client_id: id } }, body })),
    onSuccess: () => invalidate(...CLIENT_DATA),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(adminApi.DELETE("/api/v1/admin/clients/{client_id}", { params: { path: { client_id: id } } })),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ak.client(id) });
      CLIENT_DATA.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
    },
  });
}

export function useSignOutClient() {
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(adminApi.POST("/api/v1/admin/clients/{client_id}/sign-out", { params: { path: { client_id: id } } })),
  });
}

export function useMessageClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      unwrap(
        adminApi.POST("/api/v1/admin/clients/{client_id}/message", {
          params: { path: { client_id: id } },
          body: { text },
        }),
      ),
    onSuccess: (_d, v) => invalidate(ak.client(v.id), ["admin", "notifications"]),
  });
}

export function useMailboxAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: MailboxAction }) =>
      unwrap(
        adminApi.POST("/api/v1/admin/mailboxes/{mailbox_id}/{action}", {
          params: { path: { mailbox_id: id, action } },
        }),
      ),
    onSuccess: () => invalidate(...CLIENT_DATA),
  });
}

export function useDeleteMailbox() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(adminApi.DELETE("/api/v1/admin/mailboxes/{mailbox_id}", { params: { path: { mailbox_id: id } } })),
    onSuccess: () => invalidate(...CLIENT_DATA),
  });
}

export function useUpdateRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      unwrap(adminApi.PATCH("/api/v1/admin/rules/{rule_id}", { params: { path: { rule_id: id } }, body: { enabled } })),
    onSuccess: () => invalidate(ak.rules, ak.clients),
  });
}

export function useDeleteRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(adminApi.DELETE("/api/v1/admin/rules/{rule_id}", { params: { path: { rule_id: id } } })),
    onSuccess: () => invalidate(ak.rules, ak.clients, ak.overview),
  });
}

export function useSaveGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoogleConfigIn) => unwrap(adminApi.PUT("/api/v1/admin/config/google", { body })),
    onSuccess: (data) => {
      qc.setQueryData(ak.google, data);
      void qc.invalidateQueries({ queryKey: ak.overview });
    },
  });
}

export function useResetGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(adminApi.DELETE("/api/v1/admin/config/google")),
    onSuccess: (data) => {
      qc.setQueryData(ak.google, data);
      void qc.invalidateQueries({ queryKey: ak.overview });
    },
  });
}

export function useCheckGoogle() {
  return useMutation({
    mutationFn: () => unwrap(adminApi.POST("/api/v1/admin/config/google/check")),
  });
}

export function useSaveAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AIConfigIn) => unwrap(adminApi.PUT("/api/v1/admin/config/ai", { body })),
    onSuccess: (data) => qc.setQueryData(ak.ai, data),
  });
}

export function useResetAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(adminApi.DELETE("/api/v1/admin/config/ai")),
    onSuccess: (data) => qc.setQueryData(ak.ai, data),
  });
}

export function useCheckAi() {
  return useMutation({
    mutationFn: () => unwrap(adminApi.POST("/api/v1/admin/config/ai/check")),
  });
}

export function useTestRule() {
  return useMutation({
    mutationFn: (body: ToolRuleTest) => unwrap(adminApi.POST("/api/v1/admin/tools/rule", { body })),
  });
}

export function useTestDates() {
  return useMutation({
    mutationFn: (body: ToolDates) => unwrap(adminApi.POST("/api/v1/admin/tools/dates", { body })),
  });
}

export function useTestWhatsApp() {
  return useMutation({
    mutationFn: (body: { phone: string; text: string }) =>
      unwrap(adminApi.POST("/api/v1/admin/tools/whatsapp", { body })),
  });
}

export function useTestMailbox() {
  return useMutation({
    mutationFn: (body: ToolMailbox) => unwrap(adminApi.POST("/api/v1/admin/tools/mailbox", { body })),
  });
}

export function useCreateAdmin() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: AdminCreate) => unwrap(adminApi.POST("/api/v1/admin/admins", { body })),
    onSuccess: () => invalidate(ak.admins),
  });
}

export function useUpdateAdmin() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: AdminUpdate & { id: string }) =>
      unwrap(adminApi.PATCH("/api/v1/admin/admins/{admin_id}", { params: { path: { admin_id: id } }, body })),
    onSuccess: () => invalidate(ak.admins),
  });
}

export function useChangePassword() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { current_password: string; new_password: string }) =>
      unwrap(adminApi.POST("/api/v1/admin/me/password", { body })),
  });
}

export function useEditDbRow(table: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ pk, values }: { pk: string; values: Record<string, unknown> }) =>
      unwrap(
        adminApi.PATCH("/api/v1/admin/db/{table_name}/{pk}", {
          params: { path: { table_name: table, pk } },
          body: { values },
        }),
      ),
    onSuccess: () => invalidate(["admin", "db"], ak.clients, ak.mailboxes, ak.rules),
  });
}

export function useDeleteDbRow(table: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (pk: string) =>
      unwrap(adminApi.DELETE("/api/v1/admin/db/{table_name}/{pk}", { params: { path: { table_name: table, pk } } })),
    onSuccess: () => invalidate(["admin", "db"], ak.clients, ak.mailboxes, ak.rules, ak.overview),
  });
}
