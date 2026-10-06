"use client";

import { Sparkles } from "lucide-react";

import type { EventItem } from "@/lib/api/types";
import { EventCard } from "./event-card";

/** Low-confidence dates waiting for a one-tap confirm. They get no reminders until confirmed. */
export function SuggestionsSection({ events }: { events: EventItem[] }) {
  if (events.length === 0) return null;
  return (
    <section
      aria-labelledby="needs-confirmation"
      className="rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/8 via-card to-card p-4 sm:p-5"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="needs-confirmation" className="font-semibold tracking-tight">
            Needs confirmation <span className="text-muted-foreground tabular">({events.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            These dates were found in your email but MailSentinel isn&apos;t sure about them. Confirm to get reminders, or
            dismiss.
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}
