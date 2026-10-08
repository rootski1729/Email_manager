"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MessageCircle, MoreHorizontal, Pencil, Phone, Star, Trash2, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { WhatsAppCommandsCard } from "@/components/common/whatsapp-commands-card";
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
  whatsapp_self: { label: "You", icon: UserRound },
  whatsapp_number: { label: "Another number", icon: Phone },
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
    <li className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
      >
        <kind.icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{d.label}</span>
          {d.is_default ? <StatusBadge tone="brand">Gets all alerts</StatusBadge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{kind.label}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{chatIdToDisplay(d.chat_id)}</span>
          {verified ? (
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck className="size-3.5" aria-hidden /> confirmed
            </span>
          ) : null}
        </div>
      </div>
      {!verified ? (
        <Button size="sm" onClick={onVerify}>
          Confirm
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={d.is_default}
              aria-label={d.is_default ? "Gets all alerts" : "Send all alerts here"}
              disabled={d.is_default || update.isPending}
              onClick={() =>
                update.mutate({ id: d.id, is_default: true }, { onSuccess: () => toast.success(`Alerts now go to ${d.label}`) })
              }
            >
              <Star className={cn(d.is_default && "fill-primary text-primary")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{d.is_default ? "Alerts go here unless a rule says otherwise" : "Send alerts here by default"}</TooltipContent>
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
        title="WhatsApp"
        back={{ href: "/settings", label: "Settings" }}
        description="Who gets your alerts. Your own number is set up already; you can add someone else or a group."
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
          title="Alerts go to your own number"
          description="Add another number or a group if someone else should get them too."
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

      <WhatsAppCommandsCard className="mt-8" />

      <VerifyDialog key={verifying?.id ?? "none"} destination={verifying} onOpenChange={(o) => !o && setVerifying(null)} />
      <RenameDialog
        key={renaming?.id ?? "rename-none"}
        open={Boolean(renaming)}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename"
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
        description="Alerts meant for them will go to your usual number instead."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Removed");
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}
