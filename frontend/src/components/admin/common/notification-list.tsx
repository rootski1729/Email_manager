"use client";

import { MessageCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { NOTIFICATION_STATUS } from "@/lib/admin/labels";
import { useRetryNotification } from "@/lib/admin/queries";
import type { NotificationOut } from "@/lib/admin/types";
import { chatIdToDisplay } from "@/lib/format";
import { ToneBadge } from "./tone-badge";

const RETRYABLE = new Set(["failed", "dead", "cancelled"]);

const KIND_WORDS: Record<string, string> = {
  alert: "Email alert",
  digest: "Digest",
  system: "System message",
  verification: "Sign-in code",
  reply: "Reply",
  reminder: "Reminder",
  recap: "Weekly recap",
};

export function NotificationList({
  items,
  emptyTitle = "Nothing here",
  emptyDescription,
}: {
  items: NotificationOut[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const retry = useRetryNotification();
  if (items.length === 0) {
    return <EmptyState icon={MessageCircle} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((n) => {
        const s = NOTIFICATION_STATUS[n.status];
        const pending = retry.isPending && retry.variables === n.id;
        return (
          <li key={n.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                <span className="text-xs text-muted-foreground">{KIND_WORDS[n.kind] ?? n.kind}</span>
                <span className="text-xs text-muted-foreground">to {chatIdToDisplay(n.chat_id)}</span>
              </div>
              <p className="truncate text-sm font-medium">{n.subject || n.preview || "(no text)"}</p>
              {n.last_error ? (
                <p className="line-clamp-2 font-mono text-xs break-all text-destructive">{n.last_error}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                <RelativeTime iso={n.created_at} /> · {n.attempts} {n.attempts === 1 ? "attempt" : "attempts"}
              </p>
            </div>
            {RETRYABLE.has(n.status) ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate(n.id, { onSuccess: () => toast.success("Queued again — it will be sent shortly") })
                }
              >
                {pending ? <Spinner /> : <RotateCw />} Retry
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
