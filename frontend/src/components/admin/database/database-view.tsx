"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronsUpDown, Database, Download, Info, Lock, Search, Table2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Pagination } from "@/components/admin/common/pagination";
import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminDownload } from "@/lib/admin/client";
import { dbRowsQuery, dbTablesQuery } from "@/lib/admin/queries";
import type { DbTable } from "@/lib/admin/types";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { cn } from "@/lib/utils";
import { cellText } from "./cell";
import { RowSheet } from "./row-sheet";

const LIMIT = 50;
type Row = Record<string, unknown>;

function TablePicker({ tables, value, onChange }: { tables: DbTable[]; value: string; onChange: (name: string) => void }) {
  return (
    <>
      <div className="lg:hidden">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full" aria-label="Choose a table">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t.name} value={t.name}>
                {t.label} ({formatNumber(t.rows)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label="Tables" className="hidden lg:block">
        <ul className="space-y-1">
          {tables.map((t) => {
            const active = t.name === value;
            return (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => onChange(t.name)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring",
                    active && "border-border bg-card shadow-xs",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", active && "font-medium")}>{t.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular">
                      {!t.can_edit ? <Lock className="size-3" aria-label="Read-only" /> : null}
                      {formatNumber(t.rows)}
                    </span>
                  </span>
                  {t.description ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{t.description}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function RowsPanel({ table }: { table: DbTable }) {
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<string | null>(null);
  const [desc, setDesc] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const rows = useQuery(dbRowsQuery(table.name, { q, order, desc, offset, limit: LIMIT }));
  const pk = table.columns.find((c) => c.primary_key)?.name ?? "id";

  const sortBy = (col: string) => {
    if (order === col) setDesc((d) => !d);
    else {
      setOrder(col);
      setDesc(false);
    }
    setOffset(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      await adminDownload(`/api/v1/admin/db/${encodeURIComponent(table.name)}/export.csv${qs}`, `${table.name}.csv`);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{table.label}</h2>
          <Badge variant="outline" className="font-mono font-normal">
            {table.name}
          </Badge>
          {!table.can_edit ? <Badge variant="secondary">Read-only</Badge> : null}
        </div>
        {table.description ? <p className="text-sm text-muted-foreground">{table.description}</p> : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search text columns or paste an ID"
            aria-label={`Search ${table.label}`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </InputGroup>
        <Button variant="outline" className="sm:ml-auto" onClick={exportCsv} disabled={exporting}>
          {exporting ? <Spinner /> : <Download />} Export CSV
        </Button>
      </div>

      {rows.isPending ? (
        <TableSkeleton rows={8} />
      ) : rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />
      ) : rows.data.rows.length === 0 ? (
        <EmptyState
          icon={Table2}
          title={q ? "No rows match" : "This table is empty"}
          description={q ? "Try a different search." : undefined}
        />
      ) : (
        <div>
          <div className={cn("overflow-x-auto rounded-xl border bg-card", rows.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c) => {
                    const sorted = order === c.name;
                    const Icon = sorted ? (desc ? ArrowDown : ArrowUp) : ChevronsUpDown;
                    return (
                      <TableHead key={c.name} aria-sort={sorted ? (desc ? "descending" : "ascending") : undefined}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
                          onClick={() => sortBy(c.name)}
                        >
                          {c.name}
                          <Icon className={cn("size-3", !sorted && "opacity-40")} aria-hidden />
                        </button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.data.rows.map((r, i) => (
                  <TableRow
                    key={String(r[pk] ?? i)}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                  >
                    {table.columns.map((c) => {
                      const text = cellText(c, r[c.name]);
                      return (
                        <TableCell
                          key={c.name}
                          className={cn(
                            "max-w-64 truncate text-xs",
                            (r[c.name] == null || c.hidden) && "text-muted-foreground",
                            (c.type === "uuid" || c.primary_key) && "font-mono",
                          )}
                          title={c.hidden ? undefined : text}
                        >
                          {text}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination offset={offset} limit={LIMIT} total={rows.data.total} onChange={setOffset} />
        </div>
      )}

      <RowSheet
        table={table}
        row={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onSaved={(row) => setSelected(row)}
      />
    </div>
  );
}

export function DatabaseView({ initialTable }: { initialTable?: string }) {
  const tables = useQuery(dbTablesQuery);
  const [picked, setPicked] = useState<string | null>(initialTable ?? null);
  const current = tables.data?.find((t) => t.name === picked) ?? tables.data?.[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Database"
        description="Look at and fix the raw data behind MailSentinel. Secrets are always hidden."
        className="pb-0"
      />
      <Alert>
        <Info />
        <AlertDescription>
          Edits and deletes take effect immediately for the client and are written to the activity log. Prefer the
          Clients, Mailboxes and Rules pages for everyday changes.
        </AlertDescription>
      </Alert>
      {tables.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
          <TableSkeleton rows={8} />
        </div>
      ) : tables.isError ? (
        <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />
      ) : !current ? (
        <EmptyState icon={Database} title="No tables" description="The database didn't report any tables." />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <TablePicker tables={tables.data} value={current.name} onChange={setPicked} />
          <RowsPanel key={current.name} table={current} />
        </div>
      )}
    </div>
  );
}
