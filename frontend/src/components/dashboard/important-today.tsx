"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, MailCheck, Paperclip } from "lucide-react";
import Link from "next/link";

import { RefBadge } from "@/components/common/ref-badge";
import { RelativeTime } from "@/components/common/relative-time";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { messagesQuery } from "@/lib/api/queries";
import { dayKey } from "@/lib/datetime";
import { initials } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { useRealtime } from "@/lib/realtime/realtime-provider";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  key: string;
  from: string;
  subject: string;
  reason?: string;
  ref?: string | null;
  at: string | null | undefined;
  fresh: boolean;
  attachment?: boolean;
}

const SHOWN = 5;

function EmailRow({ r }: { r: Row }) {
  return (
    <li>
      <Link
        href={`/messages/${r.id}`}
        className={cn(
          "flex items-start gap-3 rounded-xl px-3 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
          r.fresh && "animate-in fade-in slide-in-from-top-1",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            r.fresh ? "bg-brand-ink text-brand-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          {initials(r.from)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{r.from}</span>
            <RelativeTime iso={r.at} className="shrink-0 text-xs text-muted-foreground" fallback="" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-foreground/85">{r.subject || "(no subject)"}</span>
            {r.attachment ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" /> : null}
          </div>
          {r.ref || r.reason ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <RefBadge value={r.ref} hint={false} />
              {r.reason ? <span className="truncate">{r.reason}</span> : null}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** The latest important emails (today first), live over SSE. */
export function ImportantToday() {
  const { feed } = useRealtime();
  const latest = useInfiniteQuery(messagesQuery({}, 10));
  const zone = useZone();
  const now = useNow();

  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const e of feed) {
    if (seen.has(e.message_id)) continue;
    seen.add(e.message_id);
    rows.push({
      id: e.message_id,
      key: e.key,
      from: e.from_name || e.from_address,
      subject: e.subject,
      reason: e.rules?.[0],
      ref: e.ref,
      at: e.received_at,
      fresh: true,
    });
  }
  for (const m of latest.data?.pages[0]?.items ?? []) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    rows.push({
      id: m.id,
      key: m.id,
      from: m.from_name || m.from_address,
      subject: m.subject,
      reason: m.rules?.[0],
      ref: m.ref,
      at: m.received_at,
      fresh: false,
      attachment: m.has_attachments,
    });
  }
  const today = now ? dayKey(now, zone) : null;
  const todays = today ? rows.filter((r) => r.at && dayKey(r.at, zone) === today) : [];
  const shown = (todays.length ? todays : rows).slice(0, SHOWN);
  const showingEarlier = todays.length === 0 && shown.length > 0;

  return (
    <Card className="gap-2 py-3">
      <div className="flex items-center justify-between gap-2 px-4 pt-1">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Today&apos;s important emails</h2>
          <p className="text-sm text-muted-foreground">
            {todays.length
              ? `${todays.length} so far today${todays.length > SHOWN ? ` (showing the latest ${SHOWN})` : ""}`
              : showingEarlier
                ? "Nothing yet today. Here are the latest ones."
                : "They appear here and on your WhatsApp."}
          </p>
        </div>
      </div>
      <div className="px-1">
        {latest.isPending && feed.length === 0 ? (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15 text-brand-ink">
              <MailCheck className="size-5" aria-hidden />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground text-pretty">
              No important emails yet. When one arrives, you&apos;ll see it here — and get it on WhatsApp.
            </p>
          </div>
        ) : (
          <ul aria-live="polite">
            {shown.map((r) => (
              <EmailRow key={r.key} r={r} />
            ))}
          </ul>
        )}
      </div>
      {rows.length ? (
        <div className="border-t px-4 pt-3">
          <Link
            href="/messages"
            className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            See all important mail <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
