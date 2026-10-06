"use client";

import { useQuery } from "@tanstack/react-query";
import { FlaskConical, ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { RuleTable } from "@/components/admin/common/rule-table";
import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rulesQuery } from "@/lib/admin/queries";
import { useDebounced } from "@/lib/hooks/use-debounced";

export function RulesView({ clientId }: { clientId?: string }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"all" | "on" | "off">("all");
  const q = useDebounced(search.trim(), 300);
  const list = useQuery(rulesQuery({ q, clientId: clientId ?? null }));
  const items = (list.data ?? []).filter((r) => state === "all" || (state === "on") === r.enabled);
  const owner = clientId ? list.data?.[0] : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        description="What each client watches for. Each rule's conditions are summarised in plain words."
        className="pb-0"
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/tools?tab=rule">
              <FlaskConical /> Rule tester
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by rule name"
            aria-label="Search rules"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select value={state} onValueChange={(v) => setState(v as typeof state)}>
          <SelectTrigger className="w-36" aria-label="Filter by on/off">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">On and off</SelectItem>
            <SelectItem value="on">Only on</SelectItem>
            <SelectItem value="off">Only off</SelectItem>
          </SelectContent>
        </Select>
        {clientId ? (
          <Badge variant="secondary" className="h-7 gap-1 pr-1">
            Client: {owner?.owner_name || owner?.owner_phone || "selected"}
            <Button variant="ghost" size="icon-xs" asChild aria-label="Show all clients">
              <Link href="/admin/rules">
                <X />
              </Link>
            </Button>
          </Badge>
        ) : null}
      </div>
      {list.isPending ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title={q || state !== "all" ? "No rules match" : "No rules yet"}
          description={
            q || state !== "all"
              ? "Try a different search or filter."
              : "Rules appear here when clients create them or turn on a starter pack."
          }
        />
      ) : (
        <RuleTable items={items} />
      )}
    </div>
  );
}
