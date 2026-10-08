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
import { useRetryNotification } from "@/lib/api/queries";
import type { Destination, Notification } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import { ALERT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<Notification["kind"], string> = {
  alert: "Email alert",
  digest: "Daily summary",
  system: "Notice",
  verification: "Sign-in code",
  reply: "Bot reply",
  reminder: "Reminder",
  recap: "Weekly recap",
};

/** One WhatsApp message we sent: what it was, who it went to, and whether it arrived. */
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
  const s = ALERT_STATUS[n.status];
  const canRetry = n.status === "failed" || n.status === "dead";
  const dest = n.destination_id ? destinations?.get(n.destination_id) : undefined;
  const target = dest?.kind === "whatsapp_self" ? "you" : (dest?.label ?? chatIdToDisplay(n.chat_id));
  const text = n.body ?? n.preview ?? "";
  const title = n.subject || n.preview || KIND_LABEL[n.kind];

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <li className={cn("rounded-2xl border bg-card", n.status === "dead" && "border-destructive/30")}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={s.tone} pulse={n.status === "sending"}>
                {s.label}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">{KIND_LABEL[n.kind]}</span>
            </div>
            <p className="line-clamp-1 text-sm font-medium">{title}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {n.chat_id.endsWith("@g.us") ? <Users className="size-3.5" aria-hidden /> : null}
              <span>To {target}</span>
              <span aria-hidden>·</span>
              <RelativeTime iso={n.sent_at ?? n.created_at} />
            </p>
            {n.status !== "sent" && n.status !== "delivered" && n.status !== "read" ? (
              <p className="text-xs text-muted-foreground">
                {s.hint}
                {n.status === "failed" ? (
                  <>
                    {" "}
                    Next try <RelativeTime iso={n.next_attempt_at} />.
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {showMessageLink && n.message_id ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/messages/${n.message_id}`}>
                  Open email <ExternalLink />
                </Link>
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                variant="outline"
                size="sm"
                disabled={retry.isPending}
                onClick={() => retry.mutate(n.id, { onSuccess: () => toast.success("Trying again") })}
              >
                {retry.isPending ? <Spinner /> : <RotateCw />} Retry
              </Button>
            ) : null}
            {text || n.last_error || n.held_reason ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={open ? "Hide details" : "Show details"}>
                  <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            ) : null}
          </div>
        </div>
        <CollapsibleContent>
          <div className="space-y-3 border-t p-4">
            {text ? <WhatsAppBubble text={text} time="" ticks={n.status === "read"} className="max-w-lg" /> : null}
            {n.held_reason || n.last_error ? (
              <dl className="space-y-1 text-xs text-muted-foreground">
                {n.held_reason ? (
                  <div>
                    <dt className="inline font-medium text-foreground">Why it waited: </dt>
                    <dd className="inline">{n.held_reason}</dd>
                  </div>
                ) : null}
                {n.last_error ? (
                  <div>
                    <dt className="inline font-medium text-foreground">What went wrong: </dt>
                    <dd className="inline font-mono break-words">{n.last_error}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="inline font-medium text-foreground">Tries: </dt>
                  <dd className="inline tabular">{n.attempts}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
