"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MoreHorizontal,
  Pause,
  PauseCircle,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ProviderIcon } from "@/components/common/provider-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteMailbox, useSyncMailbox, useUpdateMailbox } from "@/lib/api/queries";
import type { Mailbox } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStartGmailConnect } from "./connect-gmail-button";
import { RenameDialog } from "./rename-dialog";
import { UpdateImapLoginDialog } from "./update-imap-login-dialog";

export function MailboxCard({ mailbox }: { mailbox: Mailbox }) {
  const update = useUpdateMailbox();
  const remove = useDeleteMailbox();
  const sync = useSyncMailbox();
  const gmail = useStartGmailConnect();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingLogin, setUpdatingLogin] = useState(false);
  const paused = mailbox.status === "paused";
  const needsReauth = mailbox.status === "reauth_required";
  const broken = mailbox.status === "error";
  const isGmail = mailbox.provider === "gmail";
  const reconnect = () =>
    isGmail ? gmail.start({ loginHint: mailbox.address, send: mailbox.can_send }) : setUpdatingLogin(true);

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4",
        needsReauth && "border-warning/40",
        broken && "border-destructive/40",
      )}
    >
      <div className="flex items-start gap-3">
        <ProviderIcon provider={mailbox.provider} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{mailbox.display_name || mailbox.address}</h3>
          <p className="truncate text-sm text-muted-foreground">
            {mailbox.display_name ? mailbox.address : isGmail ? "Gmail" : "Email account"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${mailbox.address}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!paused && !needsReauth ? (
              <DropdownMenuItem
                onSelect={() =>
                  sync.mutate(mailbox.id, {
                    onSuccess: () => toast.success("Checking now", { description: "Anything important will show up in a moment." }),
                  })
                }
              >
                <RefreshCw /> Check for new email now
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() =>
                update.mutate(
                  { id: mailbox.id, paused: !paused },
                  { onSuccess: () => toast.success(paused ? "Watching again" : "Paused") },
                )
              }
            >
              {paused ? <Play /> : <Pause />} {paused ? "Start watching again" : "Pause watching"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Give it a nickname
            </DropdownMenuItem>
            {isGmail && !mailbox.can_send ? (
              <DropdownMenuItem onSelect={() => gmail.start({ loginHint: mailbox.address, send: true })}>
                <Send /> Allow sending from WhatsApp
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={reconnect}>
              <RotateCcw /> {isGmail ? "Reconnect Google account" : "Update password or settings"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Remove mailbox
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1.5" role="status">
        {needsReauth ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            {isGmail ? "Google asked us to reconnect" : "The password stopped working"}
          </p>
        ) : broken ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" aria-hidden /> Having trouble checking this mailbox
          </p>
        ) : paused ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <PauseCircle className="size-4" aria-hidden /> Paused — not checking for now
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            <span className="font-medium text-success">Connected</span>
            <span className="text-muted-foreground">
              · checked <RelativeTime iso={mailbox.last_synced_at} fallback="soon" />
            </span>
          </p>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular">{formatNumber(mailbox.messages_scanned)} emails checked</span>
          {mailbox.can_send ? (
            <span className="inline-flex items-center gap-1">
              <Send className="size-3" aria-hidden /> Can send from WhatsApp
            </span>
          ) : null}
        </p>
        {(needsReauth || broken) && mailbox.last_error ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring">
              What went wrong?
            </summary>
            <p className="mt-1 break-words">
              {mailbox.last_error}
              {mailbox.error_count > 1 ? ` (${mailbox.error_count} times in a row)` : ""}
            </p>
          </details>
        ) : null}
      </div>

      {needsReauth || broken ? (
        <div>
          <Button size="sm" onClick={reconnect} disabled={gmail.pending}>
            {gmail.pending ? <Spinner /> : <RotateCcw />}
            {isGmail ? "Reconnect" : needsReauth ? "Enter a new app password" : "Check the settings"}
          </Button>
        </div>
      ) : null}

      <RenameDialog
        key={renaming ? "open" : "closed"}
        open={renaming}
        onOpenChange={setRenaming}
        title="Nickname"
        description={mailbox.address}
        label="Nickname"
        placeholder={mailbox.address}
        initial={mailbox.display_name ?? ""}
        allowEmpty
        pending={update.isPending}
        onSave={(value) =>
          update.mutate({ id: mailbox.id, display_name: value || null }, { onSuccess: () => setRenaming(false) })
        }
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${mailbox.address}?`}
        description="We'll stop checking it and delete its saved login. Important emails we already caught stay in your list."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(mailbox.id, {
            onSuccess: () => {
              setDeleting(false);
              toast.success("Mailbox removed");
            },
          })
        }
      />
      {!isGmail ? <UpdateImapLoginDialog mailbox={mailbox} open={updatingLogin} onOpenChange={setUpdatingLogin} /> : null}
    </article>
  );
}
