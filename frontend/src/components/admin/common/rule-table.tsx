"use client";

import { FlaskConical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { phoneDisplay } from "@/lib/admin/labels";
import { useDeleteRule, useUpdateRule } from "@/lib/admin/queries";
import { summarizeCondition } from "@/lib/admin/rule-summary";
import type { AdminRuleRow } from "@/lib/admin/types";
import { formatNumber } from "@/lib/format";

export function ruleTestHref(ruleId: string) {
  return `/admin/tools?tab=rule&rule=${encodeURIComponent(ruleId)}`;
}

export function RuleTable({ items, showOwner = true }: { items: AdminRuleRow[]; showOwner?: boolean }) {
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const [deleting, setDeleting] = useState<AdminRuleRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">On</TableHead>
              <TableHead>Rule</TableHead>
              {showOwner ? <TableHead className="hidden md:table-cell">Client</TableHead> : null}
              <TableHead className="hidden text-right sm:table-cell">Matches</TableHead>
              <TableHead className="hidden lg:table-cell">Last match</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => {
              const summary = summarizeCondition(r.condition);
              const toggling = update.isPending && update.variables?.id === r.id;
              return (
                <TableRow key={r.id} className={r.enabled ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <Switch
                      checked={toggling ? update.variables?.enabled : r.enabled}
                      disabled={toggling}
                      aria-label={r.enabled ? `Turn off ${r.name}` : `Turn on ${r.name}`}
                      onCheckedChange={(enabled) =>
                        update.mutate(
                          { id: r.id, enabled },
                          { onSuccess: () => toast.success(enabled ? "Rule turned on" : "Rule turned off") },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-[28rem] min-w-56 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{r.name}</span>
                      {r.source ? (
                        <Badge variant="outline" className="font-normal">
                          {r.source}
                        </Badge>
                      ) : null}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="mt-0.5 line-clamp-2 cursor-default text-xs text-muted-foreground">{summary}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">{summary}</TooltipContent>
                    </Tooltip>
                    {showOwner ? (
                      <Link
                        href={`/admin/clients/${r.user_id}`}
                        className="mt-1 block truncate text-xs text-muted-foreground hover:underline md:hidden"
                      >
                        {r.owner_name || phoneDisplay(r.owner_phone)}
                      </Link>
                    ) : null}
                  </TableCell>
                  {showOwner ? (
                    <TableCell className="hidden max-w-48 md:table-cell">
                      <Link href={`/admin/clients/${r.user_id}`} className="block truncate hover:underline">
                        {r.owner_name || phoneDisplay(r.owner_phone)}
                      </Link>
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden text-right tabular sm:table-cell">{formatNumber(r.match_count)}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    <RelativeTime iso={r.last_matched_at} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={ruleTestHref(r.id)} aria-label={`Test ${r.name}`}>
                              <FlaskConical />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Test this rule</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            aria-label={`Delete ${r.name}`}
                            onClick={() => setDeleting(r)}
                          >
                            <Trash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete rule</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this rule?"
        description={
          <>
            <span className="font-medium text-foreground">{deleting?.name}</span> will stop matching emails for{" "}
            {deleting?.owner_name || phoneDisplay(deleting?.owner_phone)}. Emails it already matched are kept.
          </>
        }
        confirmLabel="Delete rule"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Rule deleted");
              setDeleting(null);
            },
          });
        }}
      />
    </>
  );
}
