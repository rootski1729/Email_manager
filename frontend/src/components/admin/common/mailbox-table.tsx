"use client";

import { MoreHorizontal, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAILBOX_STATUS, phoneDisplay } from "@/lib/admin/labels";
import { useDeleteMailbox, useMailboxAction } from "@/lib/admin/queries";
import type { AdminMailboxRow, MailboxAction } from "@/lib/admin/types";
import { formatNumber } from "@/lib/format";
import { ToneBadge } from "./tone-badge";

const ACTION_DONE: Record<MailboxAction, string> = {
  sync: "Checking this mailbox now",
  pause: "Mailbox paused",
  resume: "Mailbox resumed — checking now",
};

function MailboxMenu({ m, onDelete }: { m: AdminMailboxRow; onDelete: () => void }) {
  const action = useMailboxAction();
  const run = (a: MailboxAction) =>
    action.mutate({ id: m.id, action: a }, { onSuccess: () => toast.success(ACTION_DONE[a]) });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.address}`} disabled={action.isPending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run("sync")}>
          <RefreshCw /> Check now
        </DropdownMenuItem>
        {m.status === "paused" ? (
          <DropdownMenuItem onSelect={() => run("resume")}>
            <Play /> Resume
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run("pause")}>
            <Pause /> Pause
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Remove mailbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MailboxTable({ items, showOwner = true }: { items: AdminMailboxRow[]; showOwner?: boolean }) {
  const remove = useDeleteMailbox();
  const [deleting, setDeleting] = useState<AdminMailboxRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mailbox</TableHead>
              {showOwner ? <TableHead>Client</TableHead> : null}
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last checked</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Emails scanned</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => {
              const s = MAILBOX_STATUS[m.status];
              return (
                <TableRow key={m.id}>
                  <TableCell className="max-w-64">
                    <div className="truncate font-medium">{m.address}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.provider === "gmail" ? "Gmail" : "IMAP"}
                      {m.can_send ? " · can send" : ""}
                    </div>
                  </TableCell>
                  {showOwner ? (
                    <TableCell className="max-w-48">
                      <Link href={`/admin/clients/${m.user_id}`} className="block truncate hover:underline">
                        {m.owner_name || phoneDisplay(m.owner_phone)}
                      </Link>
                      {m.owner_name ? (
                        <div className="truncate text-xs text-muted-foreground tabular">{phoneDisplay(m.owner_phone)}</div>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                      {m.last_error && m.status !== "active" && m.status !== "paused" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="max-w-56 cursor-default truncate text-xs text-muted-foreground">{m.last_error}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm break-words">{m.last_error}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    <RelativeTime iso={m.last_synced_at} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular lg:table-cell">{formatNumber(m.messages_scanned)}</TableCell>
                  <TableCell>
                    <MailboxMenu m={m} onDelete={() => setDeleting(m)} />
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
        title="Remove this mailbox?"
        description={
          <>
            <span className="font-medium text-foreground">{deleting?.address}</span> will stop being checked and its
            saved sign-in is deleted. The client can connect it again later.
          </>
        }
        confirmLabel="Remove mailbox"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Mailbox removed");
              setDeleting(null);
            },
          });
        }}
      />
    </>
  );
}
