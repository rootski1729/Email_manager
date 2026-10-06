"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Paperclip, Radio } from "lucide-react";
import Link from "next/link";

import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { messagesQuery } from "@/lib/api/queries";
import { useRealtime } from "@/lib/realtime/realtime-provider";
import { cn } from "@/lib/utils";

interface FeedRow {
  id: string;
  key: string;
  from: string;
  subject: string;
  rules: string[];
  at: string | null | undefined;
  fresh: boolean;
  attachment?: boolean;
}

export function LiveFeed() {
  const { feed, connection } = useRealtime();
  const latest = useInfiniteQuery(messagesQuery({}, 8));

  const seen = new Set<string>();
  const rows: FeedRow[] = [];
  for (const e of feed) {
    if (seen.has(e.message_id)) continue;
    seen.add(e.message_id);
    rows.push({
      id: e.message_id,
      key: e.key,
      from: e.from_name || e.from_address,
      subject: e.subject,
      rules: e.rules ?? [],
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
      rules: m.rules ?? [],
      at: m.received_at,
      fresh: false,
      attachment: m.has_attachments,
    });
  }
  const shown = rows.slice(0, 8);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Live matches
          {connection === "open" ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600 dark:text-emerald-400">
              <Radio className="size-3.5" /> live
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>New matches appear here the moment they&apos;re found.</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/messages">View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        {latest.isPending && feed.length === 0 ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No matches yet. When an email hits one of your rules, it shows up here instantly.
          </p>
        ) : (
          <ul className="divide-y" aria-live="polite">
            {shown.map((r) => (
              <li key={r.key}>
                <Link
                  href={`/messages/${r.id}`}
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                    r.fresh && "animate-in fade-in slide-in-from-top-1",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", r.fresh ? "bg-primary" : "bg-muted-foreground/30")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.subject || "(no subject)"}</span>
                      {r.attachment ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" /> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate">{r.from}</span>
                      {r.rules.slice(0, 2).map((rule) => (
                        <Badge key={rule} variant="secondary" className="h-4.5 px-1.5 text-[10px]">
                          {rule}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <RelativeTime iso={r.at} className="shrink-0 text-xs text-muted-foreground" fallback="" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
