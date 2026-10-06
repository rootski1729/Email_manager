"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useCreateEvent, useUpdateEvent } from "@/lib/api/deadlines";
import { EVENT_KINDS, type EventItem, type EventKind, type EventUpdate } from "@/lib/api/types";
import { addDays, dayKey, timeKey, zonedToUtc } from "@/lib/datetime";
import { useZone } from "@/lib/hooks/use-zone";
import { kindMeta } from "./event-kinds";

interface FormState {
  title: string;
  kind: EventKind;
  date: string;
  time: string;
  allDay: boolean;
  location: string;
}

function initialForm(event: EventItem | undefined, zone: string, defaults?: Partial<FormState>): FormState {
  if (event) {
    return {
      title: event.title,
      kind: event.kind,
      date: dayKey(event.starts_at, zone),
      time: event.all_day ? "09:00" : timeKey(event.starts_at, zone),
      allDay: event.all_day,
      location: event.location ?? "",
    };
  }
  return {
    title: "",
    kind: "deadline",
    date: addDays(dayKey(new Date(), zone), 1),
    time: "10:00",
    allDay: true,
    location: "",
    ...defaults,
  };
}

/**
 * Add or edit an event. Mount with a `key` per target so the form resets.
 * After saving, the backend reschedules the WhatsApp reminders.
 */
export function EventDialog({
  open,
  onOpenChange,
  event,
  messageId,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EventItem;
  messageId?: string;
  defaults?: Partial<FormState>;
  onSaved?: (event: EventItem) => void;
}) {
  const zone = useZone();
  const id = useId();
  const create = useCreateEvent();
  const update = useUpdateEvent({ silent: true });
  const [form, setForm] = useState<FormState>(() => initialForm(event, zone, defaults));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    const title = form.title.trim();
    if (!title) {
      setTitleError("Give it a short title, e.g. “Physics end-sem exam”.");
      return;
    }
    if (!form.date) {
      setError("Pick a date.");
      return;
    }
    const startsAt = zonedToUtc(form.date, form.allDay ? "00:00" : form.time, zone).toISOString();
    const location = form.location.trim() || null;
    try {
      let saved: EventItem;
      if (event) {
        const body: EventUpdate = {};
        if (title !== event.title) body.title = title;
        if (form.kind !== event.kind) body.kind = form.kind;
        if (form.allDay !== event.all_day) body.all_day = form.allDay;
        if (startsAt !== new Date(event.starts_at).toISOString()) body.starts_at = startsAt;
        if (location !== (event.location ?? null)) body.location = location;
        // Fixing a suggestion is the confirmation: it becomes upcoming and gets reminders.
        if (event.status === "suggested") body.status = "upcoming";
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }
        saved = await update.mutateAsync({ id: event.id, body });
        toast.success(event.status === "suggested" ? "Confirmed" : "Event updated", {
          description: saved.status === "upcoming" ? "WhatsApp reminders are scheduled." : undefined,
        });
      } else {
        saved = await create.mutateAsync({
          title,
          kind: form.kind,
          starts_at: startsAt,
          all_day: form.allDay,
          location,
          message_id: messageId ?? null,
        });
        toast.success("Event added", { description: "You'll get WhatsApp reminders before it." });
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors() : [];
      const t = fe.find((e) => e.path === "title");
      if (t) setTitleError(t.message);
      setError(t && fe.length === 1 ? null : errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Add an event"}</DialogTitle>
          <DialogDescription>
            {event?.status === "suggested"
              ? "Fix anything that was read wrong. Saving confirms it, so WhatsApp reminders are scheduled."
              : "Reminders go out on WhatsApp before it starts."}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field data-invalid={Boolean(titleError) || undefined}>
            <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
            <Input
              id={`${id}-title`}
              value={form.title}
              maxLength={200}
              placeholder="Physics end-sem exam"
              autoFocus
              aria-invalid={Boolean(titleError) || undefined}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError ? <FieldError>{titleError}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-kind`}>Type</FieldLabel>
            <Select value={form.kind} onValueChange={(v) => set("kind", v as EventKind)}>
              <SelectTrigger id={`${id}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_KINDS.map((k) => {
                  const meta = kindMeta(k);
                  return (
                    <SelectItem key={k} value={k}>
                      <meta.icon aria-hidden /> {meta.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="rounded-lg border p-3">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-allday`}>All day</FieldLabel>
              <FieldDescription>For due dates without a time.</FieldDescription>
            </FieldContent>
            <Switch id={`${id}-allday`} checked={form.allDay} onCheckedChange={(v) => set("allDay", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field className={form.allDay ? "col-span-2" : undefined}>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <Input
                id={`${id}-date`}
                type="date"
                required
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="tabular"
              />
            </Field>
            {!form.allDay ? (
              <Field>
                <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  required
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                  className="tabular"
                />
              </Field>
            ) : null}
          </div>
          <Field>
            <FieldLabel htmlFor={`${id}-location`}>Location</FieldLabel>
            <Input
              id={`${id}-location`}
              value={form.location}
              maxLength={300}
              placeholder="Optional, e.g. Hall B or a meeting link"
              onChange={(e) => set("location", e.target.value)}
            />
            <FieldDescription>Times are in your profile time zone ({zone}).</FieldDescription>
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={pending}>
            {pending ? <Spinner /> : null}
            {!event ? "Add event" : event.status === "suggested" ? "Save & confirm" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
