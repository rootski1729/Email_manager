"use client";

import { toast } from "sonner";

import { useDeleteEvent, useUpdateEvent } from "@/lib/api/deadlines";
import type { EventItem, EventStatus } from "@/lib/api/types";

const MESSAGES: Record<Exclude<EventStatus, "suggested">, (e: EventItem, from: EventStatus) => string> = {
  upcoming: (_e, from) => (from === "suggested" ? "Confirmed. Reminders are scheduled" : "Moved back to upcoming"),
  done: () => "Marked as done",
  dismissed: () => "Dismissed",
};

/** Status changes with an Undo toast, plus delete. Shared by the timeline and message detail. */
export function useEventActions() {
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  function setStatus(event: EventItem, status: Exclude<EventStatus, "suggested">) {
    const from = event.status;
    update.mutate(
      { id: event.id, body: { status } },
      {
        onSuccess: () => {
          toast.success(MESSAGES[status](event, from), {
            id: `event-${event.id}`,
            description: event.title,
            action:
              from !== status
                ? { label: "Undo", onClick: () => update.mutate({ id: event.id, body: { status: from } }) }
                : undefined,
          });
        },
      },
    );
  }

  return {
    confirm: (e: EventItem) => setStatus(e, "upcoming"),
    done: (e: EventItem) => setStatus(e, "done"),
    dismiss: (e: EventItem) => setStatus(e, "dismissed"),
    remove: (e: EventItem, onDone?: () => void) =>
      remove.mutate(
        { id: e.id, messageId: e.message_id },
        {
          onSuccess: () => {
            toast.success("Event deleted", { description: e.title });
            onDone?.();
          },
        },
      ),
    pendingId: update.isPending ? update.variables?.id : undefined,
    deleting: remove.isPending,
  };
}
