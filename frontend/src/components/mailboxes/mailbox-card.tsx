"use client";

import { AlertTriangle, MoreHorizontal, Pause, Pencil, Play, RefreshCw, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ProviderIcon } from "@/components/common/provider-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { KeyValue } from "@/components/common/stat";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { MAILBOX_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useStartGmailConnect } from "./connect-gmail-button";
import { UpdateImapLoginDialog } from "./update-imap-login-dialog";
import { RenameDialog } from "./rename-dialog";

export function MailboxCard({ mailbox }: { mailbox: Mailbox }) {
  const status = MAILBOX_STATUS[mailbox.status];
  const update = useUpdateMailbox();
  const remove = useDeleteMailbox();
  const sync = useSyncMailbox();
  const gmail = useStartGmailConnect();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingLogin, setUpdatingLogin] = useState(false);
  const paused = mailbox.status === "paused";
  const needsReauth = mailbox.status === "reauth_required";
  const isGmail = mailbox.provider === "gmail";

  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-card transition-shadow hover:shadow-sm",
        needsReauth && "border-amber-500/40",
        mailbox.status === "error" && "border-rose-500/40",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <ProviderIcon provider={mailbox.provider} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{mailbox.display_name || mailbox.address}</h3>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {mailbox.can_send ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-primary/10 px-2 text-xs font-medium text-primary ring-1 ring-primary/20 ring-inset">
                    <Send className="size-3" aria-hidden /> Can send
                  </span>
                </TooltipTrigger>
                <TooltipContent>You can send email from this address on WhatsApp with /email.</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {mailbox.display_name ? mailbox.address : isGmail ? "Gmail · push notifications" : "IMAP · polled every minute"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${mailbox.address}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            {isGmail ? (
              <>
                <DropdownMenuItem
                  onSelect={() => gmail.start({ loginHint: mailbox.address, send: mailbox.can_send })}
                >
                  <RotateCcw /> Reconnect Google account
                </DropdownMenuItem>
                {!mailbox.can_send ? (
                  <DropdownMenuItem onSelect={() => gmail.start({ loginHint: mailbox.address, send: true })}>
                    <Send /> Allow sending
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : (
              <DropdownMenuItem onSelect={() => setUpdatingLogin(true)}>
                <RotateCcw /> Update login
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t px-4 py-3 sm:grid-cols-3">
        <KeyValue label="Last sync">
          <RelativeTime iso={mailbox.last_synced_at} fallback="Not yet" />
        </KeyValue>
        <KeyValue label="Emails scanned">{formatNumber(mailbox.messages_scanned)}</KeyValue>
        {isGmail ? (
          <KeyValue label="Watch renews">
            <RelativeTime iso={mailbox.watch_expires_at} fallback="Pending" />
          </KeyValue>
        ) : (
          <KeyValue label="Connected">
            <RelativeTime iso={mailbox.created_at} />
          </KeyValue>
        )}
      </dl>

      {mailbox.last_error || needsReauth ? (
        <div
          className={cn(
            "mx-4 mb-3 flex gap-2 rounded-lg px-3 py-2 text-xs",
            needsReauth ? "bg-amber-500/10 text-amber-900 dark:text-amber-100" : "bg-rose-500/10 text-rose-900 dark:text-rose-100",
          )}
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {needsReauth
                ? isGmail
                  ? "Google access expired or was revoked. Reconnect to resume monitoring."
                  : "The server rejected the saved login. Update it with a new app password to resume monitoring."
                : `Sync problem${mailbox.error_count > 1 ? ` (${mailbox.error_count} in a row)` : ""}`}
            </p>
            {mailbox.last_error ? <p className="mt-0.5 line-clamp-3 break-words opacity-80">{mailbox.last_error}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {needsReauth && isGmail ? (
          <Button
            size="sm"
            onClick={() => gmail.start({ loginHint: mailbox.address, send: mailbox.can_send })}
            disabled={gmail.pending}
          >
            {gmail.pending ? <Spinner /> : <RotateCcw />} Reconnect
          </Button>
        ) : needsReauth ? (
          <Button size="sm" onClick={() => setUpdatingLogin(true)}>
            <RotateCcw /> Update login
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={paused || sync.isPending}
            onClick={() =>
              sync.mutate(mailbox.id, {
                onSuccess: () => toast.success("Sync started", { description: "New matches will appear in a moment." }),
              })
            }
          >
            {sync.isPending ? <Spinner /> : <RefreshCw />} Sync now
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { id: mailbox.id, paused: !paused },
              { onSuccess: () => toast.success(paused ? "Monitoring resumed" : "Monitoring paused") },
            )
          }
        >
          {paused ? <Play /> : <Pause />}
          {paused ? "Resume" : "Pause"}
        </Button>
        {isGmail && !mailbox.can_send && !needsReauth ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-primary"
                disabled={gmail.pending}
                onClick={() => gmail.start({ loginHint: mailbox.address, send: true })}
              >
                <Send /> Allow sending
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ask Google for permission to send, so you can email from WhatsApp with /email.</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <RenameDialog
        key={renaming ? "open" : "closed"}
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename mailbox"
        description={mailbox.address}
        label="Display name"
        placeholder={mailbox.address}
        initial={mailbox.display_name ?? ""}
        allowEmpty
        pending={update.isPending}
        onSave={(value) =>
          update.mutate(
            { id: mailbox.id, display_name: value || null },
            { onSuccess: () => setRenaming(false) },
          )
        }
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Disconnect ${mailbox.address}?`}
        description="MailSentinel stops monitoring this mailbox and deletes its stored credentials. Matched emails already recorded stay in your history."
        confirmLabel="Disconnect"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(mailbox.id, {
            onSuccess: () => {
              setDeleting(false);
              toast.success("Mailbox disconnected");
            },
          })
        }
      />
      {!isGmail ? (
        <UpdateImapLoginDialog mailbox={mailbox} open={updatingLogin} onOpenChange={setUpdatingLogin} />
      ) : null}
    </article>
  );
}
