"use client";

import Link from "next/link";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useUpdateSettings } from "@/lib/api/queries";
import type { Settings } from "@/lib/api/types";

/** Deadline radar: find dates in important email and remind you before them. Saves instantly. */
export function AssistantSettingsCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dates and reminders</CardTitle>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="deadlines-enabled">Find dates in my email</FieldLabel>
            <FieldDescription>
              Spot exams, interviews and due dates in important email, and remind me on WhatsApp before each one.{" "}
              <Link href="/upcoming" className="underline underline-offset-2">
                See what&apos;s coming up
              </Link>
            </FieldDescription>
          </FieldContent>
          <Switch
            id="deadlines-enabled"
            checked={settings.deadlines_enabled}
            disabled={update.isPending}
            onCheckedChange={(v) =>
              update.mutate(
                { deadlines_enabled: v },
                { onSuccess: () => toast.success(v ? "We'll look for dates" : "Date finding is off") },
              )
            }
          />
        </Field>
      </CardContent>
    </Card>
  );
}
