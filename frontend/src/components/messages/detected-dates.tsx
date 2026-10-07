"use client";

import { CalendarClock, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EventCard } from "@/components/upcoming/event-card";
import { EventDialog } from "@/components/upcoming/event-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventItem } from "@/lib/api/types";

/** Dates the deadline radar found in this email, with inline confirm / dismiss / edit. */
export function DetectedDates({ messageId, events }: { messageId: string; events: EventItem[] }) {
  const [adding, setAdding] = useState(false);
  const visible = events.filter((e) => e.status !== "dismissed");
  const dismissed = events.length - visible.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" /> Dates in this email
        </CardTitle>
        <CardDescription>
          {visible.length
            ? "We'll remind you on WhatsApp before each one."
            : "We didn't find a date. Add one if you'd like a reminder."}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <CalendarPlus /> Add a date
          </Button>
        </CardAction>
      </CardHeader>
      {visible.length || dismissed ? (
        <CardContent className="space-y-3">
          {visible.length ? (
            <ul className="divide-y border-y">
              {visible.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} showSource={false} compact />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{dismissed ? `${dismissed} dismissed date${dismissed > 1 ? "s" : ""} hidden.` : null}</span>
            <Link href="/upcoming" className="underline-offset-2 hover:underline">
              See all upcoming dates
            </Link>
          </div>
        </CardContent>
      ) : null}
      {adding ? <EventDialog open={adding} onOpenChange={setAdding} messageId={messageId} /> : null}
    </Card>
  );
}
