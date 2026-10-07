"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pagination } from "@/components/admin/common/pagination";
import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { ToneBadge } from "@/components/admin/common/tone-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { planLabel } from "@/lib/admin/labels";
import { clientsQuery } from "@/lib/admin/queries";
import { PLANS } from "@/lib/admin/types";
import { formatNumber, initials } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { AddClientDialog } from "./add-client-dialog";

const LIMIT = 25;

export function ClientsView() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [plan, setPlan] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const q = useDebounced(search.trim(), 300);

  const list = useQuery(
    clientsQuery({
      q,
      status: status === "all" ? null : status,
      plan: plan === "all" ? null : plan,
      offset,
      limit: LIMIT,
    }),
  );
  const filtered = q !== "" || status !== "all" || plan !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Everyone who uses MailSentinel. Open a client to manage their mailboxes, rules and alerts."
        className="pb-0"
        actions={<AddClientDialog />}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search name, phone or email"
            aria-label="Search clients"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </InputGroup>
        <div className="flex gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={plan}
            onValueChange={(v) => {
              setPlan(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-32" aria-label="Filter by plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any plan</SelectItem>
              {PLANS.map((p) => (
                <SelectItem key={p} value={p}>
                  {planLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.isPending ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No clients match" : "No clients yet"}
          description={
            filtered
              ? "Try a different search or clear the filters."
              : "Clients appear here when they sign in with WhatsApp, or you can add one yourself."
          }
        />
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Mailboxes</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Rules</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Matched (7 d)</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/clients/${c.id}`)}
                  >
                    <TableCell className="max-w-64">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="flex items-center gap-3 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                          {initials(c.display_name, "#")}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.display_name || "Unnamed client"}</span>
                          <span className="block truncate text-xs text-muted-foreground tabular">{c.phone_e164}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.plan === "free" ? "outline" : "secondary"}>{planLabel(c.plan)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ToneBadge tone={c.is_active ? "success" : "neutral"}>
                          {c.is_active ? "Active" : "Disabled"}
                        </ToneBadge>
                        {c.problems > 0 ? (
                          <ToneBadge tone="warning">
                            <AlertTriangle className="size-3" aria-hidden />
                            {c.problems} {c.problems === 1 ? "problem" : "problems"}
                          </ToneBadge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">{formatNumber(c.mailboxes)}</TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">{formatNumber(c.rules)}</TableCell>
                    <TableCell className="hidden text-right tabular lg:table-cell">{formatNumber(c.matched_7d)}</TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      <RelativeTime iso={c.last_login_at} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination offset={offset} limit={LIMIT} total={list.data.total} onChange={setOffset} noun="clients" />
        </div>
      )}
    </div>
  );
}
