"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { MailboxTable } from "@/components/admin/common/mailbox-table";
import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAILBOX_STATUS } from "@/lib/admin/labels";
import { mailboxesQuery } from "@/lib/admin/queries";
import { MAILBOX_STATUSES, type MailboxStatus } from "@/lib/admin/types";
import { useDebounced } from "@/lib/hooks/use-debounced";

const PRIORITY: Record<MailboxStatus, number> = { error: 0, reauth_required: 1, paused: 2, active: 3 };

export function MailboxesView({ initialStatus }: { initialStatus?: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MailboxStatus | "all">(
    MAILBOX_STATUSES.includes(initialStatus as MailboxStatus) ? (initialStatus as MailboxStatus) : "all",
  );
  const q = useDebounced(search.trim(), 300);
  const list = useQuery(mailboxesQuery({ status: status === "all" ? null : status, q }));

  const items = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]),
    [list.data],
  );
  const problems = items.filter((m) => m.status === "error" || m.status === "reauth_required").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mailboxes"
        description="Every inbox connected by every client. Mailboxes with problems are listed first."
        className="pb-0"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by email address"
            aria-label="Search mailboxes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select value={status} onValueChange={(v) => setStatus(v as MailboxStatus | "all")}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {MAILBOX_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {MAILBOX_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list.data && problems > 0 ? (
          <p className="text-sm text-muted-foreground sm:ml-auto">
            {problems} {problems === 1 ? "mailbox needs" : "mailboxes need"} attention
          </p>
        ) : null}
      </div>
      {list.isPending ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={q || status !== "all" ? "No mailboxes match" : "No mailboxes yet"}
          description={
            q || status !== "all"
              ? "Try a different search or status."
              : "Mailboxes appear here when clients connect Gmail or another inbox."
          }
        />
      ) : (
        <MailboxTable items={items} />
      )}
    </div>
  );
}
