"use client";

import { Check, CheckCheck, Clock, MessageCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRetryNotification } from "@/lib/api/queries";
import type { Destination, Notification } from "@/lib/api/types";
import { formatInZone } from "@/lib/datetime";
import { chatIdToDisplay } from "@/lib/format";
import { useZone } from "@/lib/hooks/use-zone";
import { ALERT_STATUS, TONE_CLASSES } from "@/lib/status";
import { cn } from "@/lib/utils";

const KIND_VERB: Partial<Record<Notification["kind"], string>> = {
  reminder: "Reminder",
  digest: "In your summary",
};

function StatusIcon({ n }: { n: Notification }) {
  const cls = "size-4 shrink-0";
  switch (n.status) {
    case "read":
    case "delivered":
      return <CheckCheck className={cls} aria-hidden />;
    case "sent":
      return <Check className={cls} aria-hidden />;
    case "dead":
    case "failed":
      return <TriangleAlert className={cls} aria-hidden />;
    default:
      return <Clock className={cls} aria-hidden />;
  }
}

/** "Sent to your WhatsApp ✓ 10:32" — one calm line per alert, with Retry when it failed. */
function DeliveryLine({ n, destinations }: { n: Notification; destinations?: Map<string, Destination> }) {
  const zone = useZone();
  const retry = useRetryNotification();
  const [open, setOpen] = useState(false);
  const s = ALERT_STATUS[n.status];
  const dest = n.destination_id ? destinations?.get(n.destination_id) : undefined;
  const target = dest?.kind === "whatsapp_self" ? "your WhatsApp" : (dest?.label ?? chatIdToDisplay(n.chat_id));
  const when = n.sent_at ?? n.created_at;
  const time = formatInZone(when, zone, { hour: "numeric", minute: "2-digit" });
  const text = n.body ?? n.preview ?? "";
  const ok = n.status === "sent" || n.status === "delivered" || n.status === "read";
  const verb = KIND_VERB[n.kind];

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className={cn("inline-flex items-center gap-1.5", TONE_CLASSES[s.tone].text)}>
          <StatusIcon n={n} />
          <span className="font-medium">{s.label}</span>
        </span>
        <span className="text-muted-foreground">
          {verb ? `${verb} · ` : ""}
          {ok ? "to" : "for"} {target}
          {" · "}
          <time dateTime={when} suppressHydrationWarning>
            {time}
          </time>
        </span>
        <span className="ml-auto flex items-center gap-1">
          {n.status === "dead" || n.status === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate(n.id, { onSuccess: () => toast.success("Trying again") })}
            >
              {retry.isPending ? <Spinner /> : <RotateCw />} Retry
            </Button>
          ) : null}
          {text ? (
            <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide message" : "See message"}
            </Button>
          ) : null}
        </span>
      </div>
      {n.status !== "dead" && !ok ? <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p> : null}
      {open && text ? <WhatsAppBubble text={text} time={time} ticks={n.status === "read"} className="mt-2 max-w-lg" /> : null}
    </li>
  );
}

export function WhatsAppDeliveries({
  notifications,
  destinations,
}: {
  notifications: Notification[];
  destinations?: Map<string, Destination>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <MessageCircle className="size-4 text-wa" aria-hidden /> On your WhatsApp
      </h2>
      {notifications.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          No WhatsApp message for this one yet. It may be waiting for your daily summary or quiet hours to end.
        </p>
      ) : (
        <ul className="mt-1 divide-y">
          {notifications.map((n) => (
            <DeliveryLine key={n.id} n={n} destinations={destinations} />
          ))}
        </ul>
      )}
    </div>
  );
}
