"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, MoreHorizontal, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/stat";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mailboxesQuery, templatesQuery, useDeleteTemplate, useUpdateTemplate } from "@/lib/api/queries";
import type { EmailTemplate, Mailbox } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ComposeBanners } from "./compose-banners";
import { HowItWorksCard } from "./how-it-works-card";
import { SendEmailHeader } from "./send-email-header";

export function recipientsSummary(t: Pick<EmailTemplate, "to_addresses" | "cc_addresses" | "bcc_addresses">): string {
  const to = t.to_addresses;
  const extra = t.cc_addresses.length + t.bcc_addresses.length;
  if (to.length === 0 && extra === 0) return "Recipients filled in on WhatsApp";
  const head = to.length ? `To ${to[0]}${to.length > 1 ? ` +${to.length - 1}` : ""}` : "No To address";
  return extra ? `${head} · ${extra} in Cc/Bcc` : head;
}

function TemplateRow({ t, mailboxes, onDelete }: { t: EmailTemplate; mailboxes: Mailbox[]; onDelete: () => void }) {
  const update = useUpdateTemplate();
  const from = t.mailbox_id ? mailboxes.find((m) => m.id === t.mailbox_id) : undefined;
  const command = `/email ${t.name}`;
  return (
    <li className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-input sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/templates/${t.id}`}
            className="font-mono text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:underline"
          >
            {command}
          </Link>
          {t.is_default ? (
            <StatusBadge tone="brand">
              Used by /email
            </StatusBadge>
          ) : null}
        </div>
        {t.description ? <p className="mt-0.5 line-clamp-1 text-sm">{t.description}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Users className="size-3.5 shrink-0" />
            <span className="truncate">{recipientsSummary(t)}</span>
          </span>
          {t.subject ? <span className="truncate">“{t.subject}”</span> : null}
          <span>From {from ? from.address : "first available mailbox"}</span>
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-between gap-2 sm:justify-end">
        <span className="text-xs text-muted-foreground tabular">
          Used {formatNumber(t.use_count)} {t.use_count === 1 ? "time" : "times"}
        </span>
        <div className="flex items-center gap-1">
          <CopyButton value={command} label="Copy" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={t.is_default}
                aria-label={t.is_default ? "Default template" : "Make default"}
                disabled={t.is_default || update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: t.id, body: { is_default: true } },
                    { onSuccess: () => toast.success(`A plain /email now uses “${t.name}”`) },
                  )
                }
              >
                <Star className={cn(t.is_default && "fill-primary text-primary")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.is_default ? "Used by a plain /email" : "Use for a plain /email"}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/templates/${t.id}`}>
                  <Pencil /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

export function TemplatesView() {
  const templates = useQuery(templatesQuery);
  const mailboxes = useQuery(mailboxesQuery);
  const remove = useDeleteTemplate();
  const [deleting, setDeleting] = useState<EmailTemplate | null>(null);

  const newButton = (
    <Button asChild>
      <Link href="/templates/new">
        <Plus /> New template
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <SendEmailHeader active="templates" actions={newButton} />
      <ComposeBanners />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {templates.isPending ? (
            <ListSkeleton rows={3} />
          ) : templates.isError ? (
            <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
          ) : templates.data.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description={
                <>
                  A template fills in the usual To, subject and text for emails you send often. Then{" "}
                  <code className="font-mono">/email leave</code> on WhatsApp gives you a ready form.
                </>
              }
            >
              {newButton}
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {templates.data.map((t) => (
                <TemplateRow key={t.id} t={t} mailboxes={mailboxes.data ?? []} onDelete={() => setDeleting(t)} />
              ))}
            </ul>
          )}
        </div>
        <HowItWorksCard />
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.is_default
            ? "This is your default template. Your most-used remaining template becomes the default."
            : `/email ${deleting?.name ?? ""} will stop working. Emails already sent are not affected.`
        }
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Template deleted");
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}
