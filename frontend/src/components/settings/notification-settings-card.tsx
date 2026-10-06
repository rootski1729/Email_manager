"use client";

import { Moon, Newspaper } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useUpdateSettings } from "@/lib/api/queries";
import type { Settings } from "@/lib/api/types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function NotificationSettingsCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const [quiet, setQuiet] = useState({
    enabled: settings.quiet_hours.enabled ?? false,
    start: settings.quiet_hours.start ?? "23:00",
    end: settings.quiet_hours.end ?? "07:00",
  });
  const [digest, setDigest] = useState({
    enabled: settings.digest.enabled ?? false,
    time: settings.digest.time ?? "08:00",
  });
  const [cap, setCap] = useState(settings.daily_cap == null ? "" : String(settings.daily_cap));
  const planCap = settings.plan_limits?.daily_alerts ?? settings.plan_limits?.alerts_per_day;
  const capNum = cap.trim() === "" ? null : Number(cap);
  const capInvalid = capNum !== null && (!Number.isInteger(capNum) || capNum < 1 || capNum > 10000);
  const timesInvalid = !TIME.test(quiet.start) || !TIME.test(quiet.end) || !TIME.test(digest.time);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert delivery</CardTitle>
        <CardDescription>Control when alerts reach your phone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="quiet-enabled" className="flex items-center gap-2">
                <Moon className="size-4 text-muted-foreground" /> Quiet hours
              </FieldLabel>
              <FieldDescription>Hold alerts overnight and deliver them as one digest when quiet hours end.</FieldDescription>
            </FieldContent>
            <Switch id="quiet-enabled" checked={quiet.enabled} onCheckedChange={(v) => setQuiet({ ...quiet, enabled: v })} />
          </Field>
          {quiet.enabled ? (
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <Field>
                <FieldLabel htmlFor="quiet-start">From</FieldLabel>
                <Input id="quiet-start" type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} className="tabular" />
              </Field>
              <Field>
                <FieldLabel htmlFor="quiet-end">Until</FieldLabel>
                <Input id="quiet-end" type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} className="tabular" />
              </Field>
            </div>
          ) : null}
        </div>
        <Separator />
        <div className="space-y-3">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="digest-enabled" className="flex items-center gap-2">
                <Newspaper className="size-4 text-muted-foreground" /> Daily digest
              </FieldLabel>
              <FieldDescription>One summary message a day for rules set to digest mode.</FieldDescription>
            </FieldContent>
            <Switch id="digest-enabled" checked={digest.enabled} onCheckedChange={(v) => setDigest({ ...digest, enabled: v })} />
          </Field>
          {digest.enabled ? (
            <Field className="sm:max-w-[9rem]">
              <FieldLabel htmlFor="digest-time">Send at</FieldLabel>
              <Input id="digest-time" type="time" value={digest.time} onChange={(e) => setDigest({ ...digest, time: e.target.value })} className="tabular" />
            </Field>
          ) : null}
        </div>
        <Separator />
        <Field data-invalid={capInvalid || undefined} className="sm:max-w-xs">
          <FieldLabel htmlFor="daily-cap">Daily alert cap</FieldLabel>
          <Input
            id="daily-cap"
            inputMode="numeric"
            value={cap}
            placeholder={planCap ? `Plan default (${planCap})` : "Plan default"}
            onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))}
            className="tabular"
            aria-invalid={capInvalid || undefined}
          />
          {capInvalid ? (
            <FieldError>Enter a number between 1 and 10,000.</FieldError>
          ) : (
            <FieldDescription>Alerts beyond this are held until tomorrow. Leave empty for your plan&apos;s limit.</FieldDescription>
          )}
        </Field>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button
          disabled={capInvalid || timesInvalid || update.isPending}
          onClick={() =>
            update.mutate(
              { quiet_hours: quiet, digest, daily_cap: capNum },
              { onSuccess: () => toast.success("Delivery settings saved") },
            )
          }
        >
          {update.isPending ? <Spinner /> : null}
          Save delivery settings
        </Button>
      </CardFooter>
    </Card>
  );
}
