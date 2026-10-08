"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MailCheck, Paperclip } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { RelativeTime } from "@/components/common/relative-time";
import { SenderAvatar } from "@/components/common/sender-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messagesQuery } from "@/lib/api/queries";
import type { Message } from "@/lib/api/types";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { ChartEmpty } from "./dash-card";

const CARD = "w-[17rem] shrink-0 snap-start sm:w-[18.5rem]";

function EmailCard({ m }: { m: Message }) {
  const from = m.from_name || m.from_address;
  const rule = m.rules?.[0];
  const text = m.ai_summary || m.snippet;
  return (
    <li className={CARD}>
      <Link
        href={`/messages/${m.id}`}
        className="lift group flex h-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex items-center gap-3">
          <SenderAvatar name={from} className="size-10 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{from}</p>
            <RelativeTime iso={m.received_at} className="block text-xs text-muted-foreground" fallback="" />
          </div>
          {m.has_attachments ? (
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />
          ) : null}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-1 text-sm font-medium">{m.subject || "(no subject)"}</p>
          {text ? <p className="line-clamp-3 text-sm text-muted-foreground text-pretty">{text}</p> : null}
        </div>
        {rule ? (
          <div className="mt-auto flex items-center gap-1.5 pt-1">
            <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", tintFor(rule))}>
              {rule}
            </span>
            {m.rules.length > 1 ? <span className="text-xs text-muted-foreground">+{m.rules.length - 1}</span> : null}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

/** "Latest important emails": a swipeable row of cards with previous/next arrows on wide screens. */
export function LatestCarousel({ className }: { className?: string }) {
  const latest = useInfiniteQuery(messagesQuery({}, 10));
  const items = latest.data?.pages[0]?.items ?? [];
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  function page(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * Math.max(1, Math.floor(el.clientWidth / step)), behavior: "smooth" });
  }

  return (
    <section aria-labelledby="latest-title" className={cn("min-w-0 space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="latest-title" className="text-lg font-semibold tracking-tight">
            Latest important emails
          </h2>
          <p className="text-sm text-muted-foreground">The newest first. They also reach your WhatsApp.</p>
        </div>
        {items.length > 1 ? (
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-full bg-card"
              aria-label="Previous emails"
              aria-controls="latest-track"
              disabled={edges.start}
              onClick={() => page(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-full bg-card"
              aria-label="More emails"
              aria-controls="latest-track"
              disabled={edges.end}
              onClick={() => page(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </div>
      {latest.isPending ? (
        <div aria-busy="true" role="status" className="flex gap-4 overflow-hidden">
          <span className="sr-only">Loading…</span>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} aria-hidden className={cn(CARD, "space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border")}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border">
          <ChartEmpty
            icon={MailCheck}
            className="border-0"
            title="No important emails yet"
            text="When one arrives, you'll see it here — and get it on WhatsApp."
          />
        </div>
      ) : (
        <ul
          id="latest-track"
          ref={track}
          onScroll={measure}
          // A soft fade on whichever side has more cards, so a cut-off card reads as "there's more".
          style={{
            maskImage: `linear-gradient(to right, ${edges.start ? "black" : "transparent"}, black 2rem, black calc(100% - 3rem), ${edges.end ? "black" : "transparent"})`,
          }}
          aria-live="polite"
          className="stagger scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3 sm:-mx-1 sm:scroll-px-1 sm:px-1"
        >
          {items.map((m) => (
            <EmailCard key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
