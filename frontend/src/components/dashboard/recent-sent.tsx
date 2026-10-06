"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import Link from "next/link";

import { RelativeTime } from "@/components/common/relative-time";
import { FromTo, OutboundStatusBadge } from "@/components/sent/outbound-parts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { outboundQuery } from "@/lib/api/queries";

/** Last few emails sent from WhatsApp. Renders nothing until the feature has been used. */
export function RecentSent() {
  const recent = useInfiniteQuery(outboundQuery(undefined, 3));
  const items = recent.data?.pages[0]?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-muted-foreground" /> Sent from WhatsApp
        </CardTitle>
        <CardDescription>Your latest emails sent with /email.</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/sent">View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        <ul className="divide-y">
          {items.map((e) => (
            <li key={e.id}>
              <Link
                href={`/sent?email=${e.id}`}
                className="flex flex-col gap-1 rounded-lg px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-3"
              >
                <OutboundStatusBadge status={e.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.subject || "(no subject)"}</div>
                  <FromTo email={e} />
                </div>
                <RelativeTime iso={e.sent_at ?? e.created_at} className="shrink-0 text-xs text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
