"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MessageCircle, MoreHorizontal, Pencil, Phone, Star, Trash2, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { StatusBadge } from "@/components/common/status-badge";
import { RenameDialog } from "@/components/mailboxes/rename-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { destinationsQuery, useDeleteDestination, useUpdateDestination } from "@/lib/api/queries";
import type { Destination, DestinationKind } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddNumberDialog } from "./add-number-dialog";
import { GroupLinkDialog } from "./group-link-dialog";
import { VerifyDialog } from "./verify-dialog";

const KIND: Record<DestinationKind, { label: string; icon: typeof Phone }> = {
  whatsapp_self: { label: "Your number", icon: UserRound },
  whatsapp_number: { label: "Number", icon: Phone },
  whatsapp_group: { label: "Group", icon: Users },
};

function DestinationRow({
  d,
  onVerify,
  onRename,
  onDelete,
}: {
  d: Destination;
  onVerify: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateDestination();
  const kind = KIND[d.kind];
  const verified = Boolean(d.verified_at);
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          d.kind === "whatsapp_group" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-wa/12 text-wa",
        )}
      >
        <kind.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{d.label}</span>
          {d.is_default ? <StatusBadge tone="brand">Default</StatusBadge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{kind.label}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{chatIdToDisplay(d.chat_id)}</span>
          {verified ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <BadgeCheck className="size-3.5" /> verified <RelativeTime iso={d.verified_at} />
            </span>
          ) : null}
        </div>
      </div>
      {!verified ? (
        <Button size="sm" onClick={onVerify}>
          Verify
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={d.is_default}
              aria-label={d.is_default ? "Default destination" : "Make default"}
              disabled={d.is_default || update.isPending}
              onClick={() =>
                update.mutate({ id: d.id, is_default: true }, { onSuccess: () => toast.success(`${d.label} is now the default`) })
              }
            >
              <Star className={cn(d.is_default && "fill-amber-400 text-amber-500")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{d.is_default ? "Default for rules without a destination" : "Make default"}</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.label}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete} disabled={d.kind === "whatsapp_self"}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function DestinationsView() {
  const destinations = useQuery(destinationsQuery);
  const update = useUpdateDestination();
  const remove = useDeleteDestination();
  const [verifying, setVerifying] = useState<Destination | null>(null);
  const [renaming, setRenaming] = useState<Destination | null>(null);
  const [deleting, setDeleting] = useState<Destination | null>(null);

  return (
    <div>
      <PageHeader
        title="WhatsApp destinations"
        description="Where alerts are delivered. Rules without a specific destination use your default. New numbers must confirm a code first."
        actions={
          <>
            <GroupLinkDialog />
            <AddNumberDialog onAdded={setVerifying} />
          </>
        }
      />
      {destinations.isPending ? (
        <ListSkeleton rows={3} />
      ) : destinations.isError ? (
        <ErrorState error={destinations.error} onRetry={() => void destinations.refetch()} />
      ) : destinations.data.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No destinations yet"
          description="Alerts go to the number you signed in with. Add another number or link a group to send them elsewhere."
        />
      ) : (
        <ul className="space-y-2">
          {destinations.data.map((d) => (
            <DestinationRow
              key={d.id}
              d={d}
              onVerify={() => setVerifying(d)}
              onRename={() => setRenaming(d)}
              onDelete={() => setDeleting(d)}
            />
          ))}
        </ul>
      )}

      <VerifyDialog key={verifying?.id ?? "none"} destination={verifying} onOpenChange={(o) => !o && setVerifying(null)} />
      <RenameDialog
        key={renaming?.id ?? "rename-none"}
        open={Boolean(renaming)}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename destination"
        label="Label"
        initial={renaming?.label ?? ""}
        pending={update.isPending}
        onSave={(label) => {
          if (renaming) update.mutate({ id: renaming.id, label }, { onSuccess: () => setRenaming(null) });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.label ?? "destination"}?`}
        description="Rules that send here will fall back to your default destination."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Destination removed");
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}
