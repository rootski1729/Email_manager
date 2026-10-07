"use client";

import { AlarmClock, Check, CheckCheck, ChevronRight, Clock, MessageCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { useRetryNotification } from "@/lib/api/queries";
import type { Destination, Notification } from "@/lib/api/types";
import { dayKey, formatInZone } from "@/lib/datetime";
import { chatIdToDisplay, pluralize } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { ALERT_STATUS, TONE_CLASSES } from "@/lib/status";
import { cn } from "@/lib/utils";

const KIND_VERB: Partial<Record<Notification["kind"], string>> = {
  digest: "In your summary",
};

const DONE = new Set<Notification["status"]>(["sent", "delivered", "read"]);
const PENDING = new Set<Notification["status"]>(["queued", "sending", "held", "failed"]);

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

/** "9:00 AM" today, otherwise "Sun, 11 Oct, 9:00 AM", in the user's zone. */
function useWhen() {
  const zone = useZone();
  const now = useNow();
  return (iso: string) => {
    const today = now ? dayKey(now, zone) : "";
    const time = { hour: "numeric", minute: "2-digit" } as const;
    return dayKey(iso, zone) === today
      ? formatInZone(iso, zone, time)
      : formatInZone(iso, zone, { weekday: "short", day: "numeric", month: "short", ...time });
  };
}

/** The truthful second line for something not yet sent: soon, scheduled, held or failed. */
function pendingHint(n: Notification, now: number, when: (iso: string) => string): string {
  const due = new Date(n.next_attempt_at).getTime();
  const future = !now || due > now + 60_000;
  switch (n.status) {
    case "queued":
      return future ? `Scheduled for ${when(n.next_attempt_at)}.` : "It will go out in a moment.";
    case "held":
      return future
        ? `Held for quiet hours or today's limit. Goes out ${when(n.next_attempt_at)}.`
        : ALERT_STATUS.held.hint;
    case "failed":
      return future ? `The last try didn't work. Trying again ${when(n.next_attempt_at)}.` : ALERT_STATUS.failed.hint;
    default:
      return ALERT_STATUS[n.status].hint;
  }
}

function RetryButton({ id }: { id: string }) {
  const retry = useRetryNotification();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={retry.isPending}
      onClick={() => retry.mutate(id, { onSuccess: () => toast.success("Trying again") })}
    >
      {retry.isPending ? <Spinner /> : <RotateCw />} Retry
    </Button>
  );
}

/** "Sent to your WhatsApp ✓ 10:32" — one calm line per alert, with Retry when it failed. */
function AlertLine({ n, destinations }: { n: Notification; destinations?: Map<string, Destination> }) {
  const zone = useZone();
  const now = useNow();
  const when = useWhen();
  const [open, setOpen] = useState(false);
  const s = ALERT_STATUS[n.status];
  const dest = n.destination_id ? destinations?.get(n.destination_id) : undefined;
  const target = dest?.kind === "whatsapp_self" ? "your WhatsApp" : (dest?.label ?? chatIdToDisplay(n.chat_id));
  const text = n.body ?? n.preview ?? "";
  const ok = DONE.has(n.status);
  const verb = KIND_VERB[n.kind];
  const hint = PENDING.has(n.status) ? pendingHint(n, now, when) : n.status === "dead" ? null : ok ? null : s.hint;
  const bubbleTime = formatInZone(n.sent_at ?? n.next_attempt_at, zone, { hour: "numeric", minute: "2-digit" });

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
          {ok && n.sent_at ? (
            <>
              {" · "}
              <time dateTime={n.sent_at} suppressHydrationWarning>
                {when(n.sent_at)}
              </time>
            </>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {n.status === "dead" ? <RetryButton id={n.id} /> : null}
          {text ? (
            <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide message" : "See message"}
            </Button>
          ) : null}
        </span>
      </div>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
          {hint}
        </p>
      ) : null}
      {open && text ? <WhatsAppBubble text={text} time={bubbleTime} ticks={n.status === "read"} className="mt-2 max-w-lg" /> : null}
    </li>
  );
}

/** All reminders for this email on one line ("3 reminders scheduled · next Sun, 11 Oct, 9:00 AM"), expandable. */
function Reminders({ reminders }: { reminders: Notification[] }) {
  const when = useWhen();
  const now = useNow();
  const at = (n: Notification) => (DONE.has(n.status) && n.sent_at ? n.sent_at : n.next_attempt_at);
  const sorted = [...reminders].sort((a, b) => at(a).localeCompare(at(b)));
  const pending = sorted.filter((n) => PENDING.has(n.status));
  const sent = sorted.filter((n) => DONE.has(n.status));
  const failed = sorted.filter((n) => n.status === "dead");
  const next = pending[0];

  const parts: string[] = [];
  if (pending.length) parts.push(`${pluralize(pending.length, "reminder")} scheduled`);
  if (sent.length) parts.push(pending.length ? `${sent.length} sent` : `${pluralize(sent.length, "reminder")} sent`);
  if (failed.length) parts.push(`${failed.length} failed`);
  if (!parts.length) parts.push(`${pluralize(sorted.length, "reminder")}, none still due`);

  function rowStatus(n: Notification): { label: string; className: string } {
    if (DONE.has(n.status)) return { label: ALERT_STATUS[n.status].label, className: TONE_CLASSES[ALERT_STATUS[n.status].tone].text };
    if (n.status === "dead") return { label: "Failed", className: "text-destructive" };
    if (n.status === "cancelled") return { label: "Cancelled", className: "text-muted-foreground" };
    if (n.status === "failed") return { label: "Retrying", className: "text-warning" };
    const due = new Date(n.next_attempt_at).getTime();
    return { label: now && due <= now + 60_000 ? "Going out now" : "Scheduled", className: "text-muted-foreground" };
  }

  return (
    <li className="py-1">
      <Collapsible>
        <CollapsibleTrigger className="group/rem -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50">
          <AlarmClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{parts.join(", ")}</span>
            {next ? (
              <span className="text-muted-foreground" suppressHydrationWarning>
                {" "}
                · next {when(next.next_attempt_at)}
              </span>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/rem:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="mt-1 mb-1 ml-6 divide-y">
            {sorted.map((n) => {
              const s = rowStatus(n);
              return (
                <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <time dateTime={at(n)} className="tabular" suppressHydrationWarning>
                    {when(at(n))}
                  </time>
                  <span className={cn("ml-auto inline-flex items-center gap-1 text-xs", s.className)}>
                    {DONE.has(n.status) ? <StatusIcon n={n} /> : null}
                    {s.label}
                  </span>
                  {n.status === "dead" ? <RetryButton id={n.id} /> : null}
                </li>
              );
            })}
          </ol>
        </CollapsibleContent>
      </Collapsible>
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
  const alerts = notifications.filter((n) => n.kind !== "reminder");
  const reminders = notifications.filter((n) => n.kind === "reminder");
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <MessageCircle className="size-4 text-wa" aria-hidden /> On your WhatsApp
      </h2>
      {notifications.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          No WhatsApp message for this one yet. It may be waiting for your daily summary or quiet hours to end.
        </p>
      ) : (
        <ul className="mt-1 divide-y">
          {alerts.map((n) => (
            <AlertLine key={n.id} n={n} destinations={destinations} />
          ))}
          {reminders.length ? <Reminders reminders={reminders} /> : null}
        </ul>
      )}
    </div>
  );
}
