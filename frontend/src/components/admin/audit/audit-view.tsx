"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { auditWords } from "@/lib/admin/labels";
import { auditQuery } from "@/lib/admin/queries";
import type { AuditRow } from "@/lib/admin/types";
import { initials } from "@/lib/format";

const STEP = 100;
const MAX = 500;

function Target({ row }: { row: AuditRow }) {
  if (!row.target_type) return <span className="text-muted-foreground">—</span>;
  const id = row.target_id ?? "";
  const short = id.length > 14 ? `${id.slice(0, 8)}…` : id;
  const label = `${row.target_type.replace(/_/g, " ")}${short ? ` ${short}` : ""}`;
  if (row.target_type === "client" && id && row.action !== "client.deleted") {
    return (
      <Link href={`/admin/clients/${id}`} className="hover:underline">
        {label}
      </Link>
    );
  }
  return <span title={id || undefined}>{label}</span>;
}

function Details({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return null;
  const text = entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="mt-0.5 max-w-80 cursor-default truncate text-xs text-muted-foreground">{text}</p>
      </TooltipTrigger>
      <TooltipContent className="max-w-md break-words">{text}</TooltipContent>
    </Tooltip>
  );
}

export function AuditView() {
  const [limit, setLimit] = useState(STEP);
  const [search, setSearch] = useState("");
  const q = useQuery(auditQuery(limit));
  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (r) =>
      !needle ||
      [r.admin_username, auditWords(r), r.action, r.target_type ?? "", r.target_id ?? "", r.ip ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity log"
        description="Everything done in the admin console, newest first. It can't be edited."
        className="pb-0"
      />
      <InputGroup className="sm:max-w-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Filter by admin, action or IP"
          aria-label="Filter activity"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>
      {q.isPending ? (
        <TableSkeleton rows={10} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={needle ? "Nothing matches" : "No activity yet"}
          description={needle ? "Try another word." : "Actions taken in the admin console appear here."}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden md:table-cell">On</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="hidden lg:table-cell">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {initials(r.admin_username, "?")}
                        </span>
                        <span className="text-sm">{r.admin_username}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="text-sm font-medium">{auditWords(r)}</p>
                      <Details details={r.details} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <Target row={r} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <RelativeTime iso={r.created_at} />
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{r.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {q.data.length >= limit && limit < MAX ? (
            <div className="flex justify-center">
              <Button variant="outline" disabled={q.isFetching} onClick={() => setLimit((l) => Math.min(MAX, l + STEP))}>
                {q.isFetching ? <Spinner /> : null} Show older activity
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
