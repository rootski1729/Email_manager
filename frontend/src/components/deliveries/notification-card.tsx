"use client";

import { ChevronDown, ExternalLink, RotateCw, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/common/relative-time";
import { StatusBadge } from "@/components/common/status-badge";
import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRetryNotification } from "@/lib/api/queries";
import type { Destination, Notification } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import { NOTIFICATION_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<Notification["kind"], string> = {
  alert: "Alert",
  digest: "Digest",
  system: "System",
  verification: "Verification",
  reply: "Bot reply",
};

export function NotificationCard({
  n,
  destinations,
  showMessageLink = true,
}: {
  n: Notification;
  destinations?: Map<string, Destination>;
  showMessageLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const retry = useRetryNotification();
  const s = NOTIFICATION_STATUS[n.status];
  const canRetry = n.status === "failed" || n.status === "dead";
  const dest = n.destination_id ? destinations?.get(n.destination_id) : undefined;
  const target = dest?.label ?? chatIdToDisplay(n.chat_id);
  const text = n.body ?? n.preview ?? "";

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <li className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <StatusBadge tone={s.tone} pulse={n.status === "sending"}>
                      {s.label}
                    </StatusBadge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{s.hint}</TooltipContent>
              </Tooltip>
              <span className="text-xs font-medium text-muted-foreground uppercase">{KIND_LABEL[n.kind]}</span>
              <span className="inline-flex min-w-0 items-center gap-1 text-sm">
                {n.chat_id.endsWith("@g.us") ? <Users className="size-3.5 text-muted-foreground" /> : null}
                <span className="truncate">to {target}</span>
              </span>
            </div>
            {n.preview ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{n.preview}</p> : null}
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="sr-only">Created</dt>
                <dd>
                  Queued <RelativeTime iso={n.created_at} />
                </dd>
              </div>
              {n.sent_at ? (
                <div>
                  <dt className="sr-only">Sent</dt>
                  <dd>
                    Sent <RelativeTime iso={n.sent_at} />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="sr-only">Attempts</dt>
                <dd className="tabular">
                  {n.attempts} attempt{n.attempts === 1 ? "" : "s"}
                </dd>
              </div>
              {(n.status === "queued" || n.status === "failed") && n.attempts > 0 ? (
                <div>
                  <dt className="sr-only">Next attempt</dt>
                  <dd>
                    Next try <RelativeTime iso={n.next_attempt_at} />
                  </dd>
                </div>
              ) : null}
            </dl>
            {n.held_reason ? (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Held: {n.held_reason}</p>
            ) : null}
            {n.last_error ? (
              <p className="mt-2 rounded-md bg-rose-500/8 px-2 py-1.5 font-mono text-xs break-words text-rose-800 dark:text-rose-200">
                {n.last_error}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showMessageLink && n.message_id ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/messages/${n.message_id}`}>
                  Email <ExternalLink />
                </Link>
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                variant="outline"
                size="sm"
                disabled={retry.isPending}
                onClick={() => retry.mutate(n.id, { onSuccess: () => toast.success("Queued for another attempt") })}
              >
                {retry.isPending ? <Spinner /> : <RotateCw />} Retry
              </Button>
            ) : null}
            {text ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={open ? "Hide message" : "Show message"}>
                  <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            ) : null}
          </div>
        </div>
        {text ? (
          <CollapsibleContent>
            <div className="border-t p-3">
              <WhatsAppBubble text={text} time="" ticks={n.status === "read"} className="max-w-lg" />
            </div>
          </CollapsibleContent>
        ) : null}
      </li>
    </Collapsible>
  );
}
