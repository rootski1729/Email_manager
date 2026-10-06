"use client";

import { AlarmClock, AlertTriangle, CalendarClock, ChevronDown, Clock, Moon, Sunrise } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRemindMessage } from "@/lib/api/assist";
import { errorMessage } from "@/lib/api/errors";
import { addDays, dayKey, zonedParts, zonedToUtc } from "@/lib/datetime";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";

const PRESETS = [
  { when: "2h", label: "In 2 hours", icon: Clock },
  { when: "tonight", label: "Tonight, 8 PM", icon: Moon },
  { when: "tomorrow 9am", label: "Tomorrow, 9 AM", icon: Sunrise },
  { when: "next week", label: "Next week", icon: CalendarClock },
] as const;

function CustomReminderDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (at: Date) => void;
  pending: boolean;
  error: string | null;
}) {
  const zone = useZone();
  const id = useId();
  const [date, setDate] = useState(() => addDays(dayKey(new Date(), zone), 1));
  const [time, setTime] = useState("09:00");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remind me at…</DialogTitle>
          <DialogDescription>This email comes back to you on WhatsApp at the time you choose.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (date && time) onSubmit(zonedToUtc(date, time, zone));
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <Input id={`${id}-date`} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="tabular" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
              <Input id={`${id}-time`} type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="tabular" />
            </Field>
          </div>
          <FieldDescription>In your profile time zone ({zone}).</FieldDescription>
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={pending}>
            {pending ? <Spinner /> : null} Set reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Remind me" with presets; same as /remind K7 2h on WhatsApp. */
export function RemindMenu({ messageId }: { messageId: string }) {
  const remind = useRemindMessage();
  const zone = useZone();
  const now = useNow();
  const [custom, setCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  // "tonight" means 20:00 today; hide it once that has passed (the API would reject it).
  const late = now ? zonedParts(now, zone).hour * 60 + zonedParts(now, zone).minute > 19 * 60 + 45 : false;

  function send(body: { when?: string; at?: string }, fromDialog = false) {
    setCustomError(null);
    remind.mutate(
      { id: messageId, ...body },
      {
        onSuccess: (out) => {
          setCustom(false);
          toast.success(`I'll remind you ${out.description}`, { description: "The alert comes back on WhatsApp." });
        },
        onError: (err) => (fromDialog ? setCustomError(errorMessage(err)) : toast.error(errorMessage(err))),
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={remind.isPending}>
            {remind.isPending ? <Spinner /> : <AlarmClock />} Remind me <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Send it to me again on WhatsApp</DropdownMenuLabel>
          {PRESETS.filter((p) => !(late && p.when === "tonight")).map((p) => (
            <DropdownMenuItem key={p.when} onSelect={() => send({ when: p.when })}>
              <p.icon /> {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setCustomError(null);
              setCustom(true);
            }}
          >
            <CalendarClock /> Pick date &amp; time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {custom ? (
        <CustomReminderDialog
          open={custom}
          onOpenChange={setCustom}
          pending={remind.isPending}
          error={customError}
          onSubmit={(at) => send({ at: at.toISOString() }, true)}
        />
      ) : null}
    </>
  );
}
