"use client";

import { CalendarCheck, Check, CircleCheck, Ellipsis, EyeOff, Mail, MapPin, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RefBadge } from "@/components/common/ref-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EventItem } from "@/lib/api/types";
import { confidenceLabel, reminderPlan } from "@/lib/events";
import { cn } from "@/lib/utils";
import { EventDialog } from "./event-dialog";
import { kindMeta } from "./event-kinds";
import { CountdownChip, EventWhen } from "./event-when";
import { useEventActions } from "./use-event-actions";

function SourceLine({ event, showSource }: { event: EventItem; showSource: boolean }) {
  if (event.source === "manual" && !event.message_id) {
    return <span className="text-xs text-muted-foreground">Added by you</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {event.source === "ics" ? (
        <span className="inline-flex items-center gap-1">
          <CalendarCheck className="size-3.5" aria-hidden /> Calendar invite
        </span>
      ) : event.source === "text" ? (
        <span>Found in email</span>
      ) : (
        <span>Added by you</span>
      )}
      {showSource && event.message_id ? (
        <>
          <span aria-hidden>·</span>
          <Link
            href={`/messages/${event.message_id}`}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.message_subject || "Source email"}</span>
          </Link>
          <RefBadge value={event.message_ref} />
        </>
      ) : null}
    </div>
  );
}

export function EventCard({
  event,
  next = false,
  showSource = true,
  compact = false,
}: {
  event: EventItem;
  /** The next upcoming item: gets the countdown chip. */
  next?: boolean;
  showSource?: boolean;
  compact?: boolean;
}) {
  const meta = kindMeta(event.kind);
  const actions = useEventActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const suggested = event.status === "suggested";
  const busy = actions.pendingId === event.id;
  const conf = confidenceLabel(event.confidence);

  return (
    <article
      id={`event-${event.id}`}
      aria-label={event.title}
      className={cn(
        "group/event relative scroll-mt-24 overflow-hidden rounded-2xl border bg-card transition-[box-shadow,border-color] duration-200",
        next && "border-primary/40",
        suggested && "border-dashed",
        // Compact cards sit inside another card: no second frame, just the row.
        compact ? "rounded-none border-0 bg-transparent px-0 py-2.5" : "p-4 hover:border-(--lift-border) hover:shadow-lift",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            meta.tile,
            compact ? "size-8" : "size-9",
          )}
        >
          <meta.icon className={compact ? "size-4" : "size-4.5"} aria-hidden />
          <span className="sr-only">{meta.label}</span>
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="min-w-0 font-medium break-words text-pretty">{event.title}</h3>
                {next ? <CountdownChip event={event} /> : null}
                {suggested ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <StatusBadge tone={conf.tone}>
                          {conf.label} · {Math.round(event.confidence * 100)}%
                        </StatusBadge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      How sure MailSentinel is that this date was read correctly. Suggestions get no reminders until you
                      confirm them.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {event.status === "done" ? <StatusBadge tone="success">Done</StatusBadge> : null}
              </div>
              <EventWhen event={event} showCountdown={!next} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0" aria-label={`Actions for ${event.title}`}>
                  {busy ? <Spinner /> : <Ellipsis />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                {suggested ? (
                  <DropdownMenuItem onSelect={() => actions.confirm(event)}>
                    <Check /> Confirm
                  </DropdownMenuItem>
                ) : event.status === "upcoming" ? (
                  <DropdownMenuItem onSelect={() => actions.done(event)}>
                    <CircleCheck /> Mark done
                  </DropdownMenuItem>
                ) : null}
                {event.status !== "dismissed" ? (
                  <DropdownMenuItem onSelect={() => actions.dismiss(event)}>
                    <EyeOff /> Dismiss
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {event.location ? (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{event.location}</span>
            </p>
          ) : null}
          {event.context && !compact ? (
            <p className="line-clamp-2 border-l-2 pl-2 text-sm text-pretty text-muted-foreground/90 italic">{event.context}</p>
          ) : null}
          <SourceLine event={event} showSource={showSource} />

          {suggested ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={() => actions.confirm(event)} disabled={busy}>
                <Check /> Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => actions.dismiss(event)} disabled={busy}>
                <X /> Dismiss
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
                <Pencil /> Fix date
              </Button>
            </div>
          ) : event.status === "upcoming" && !compact ? (
            <p className="text-xs text-muted-foreground/80">{reminderPlan(event)} on WhatsApp.</p>
          ) : null}
        </div>
      </div>

      {editing ? <EventDialog key={event.id} open={editing} onOpenChange={setEditing} event={event} /> : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${event.title}”?`}
        description="Its scheduled WhatsApp reminders are cancelled. To only hide it, dismiss it instead."
        pending={actions.deleting}
        onConfirm={() => actions.remove(event, () => setDeleting(false))}
      />
    </article>
  );
}
