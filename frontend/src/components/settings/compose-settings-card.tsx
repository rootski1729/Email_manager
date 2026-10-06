"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useUpdateSettings } from "@/lib/api/queries";
import type { Settings } from "@/lib/api/types";

export function ComposeSettingsCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const perDay = settings.plan_limits?.daily_emails;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-muted-foreground" /> Email from WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="compose-enabled">Send email from WhatsApp (/email)</FieldLabel>
            <FieldDescription>
              Compose an email on WhatsApp and send it from one of your mailboxes after replying YES. Only your own
              number can use it{perDay ? `, up to ${perDay} emails a day` : ""}.{" "}
              <Link href="/templates" className="underline underline-offset-2">
                Manage templates
              </Link>
            </FieldDescription>
          </FieldContent>
          <Switch
            id="compose-enabled"
            checked={settings.compose_enabled}
            disabled={update.isPending}
            onCheckedChange={(v) =>
              update.mutate(
                { compose_enabled: v },
                { onSuccess: () => toast.success(v ? "Sending from WhatsApp is on" : "Sending from WhatsApp is off") },
              )
            }
          />
        </Field>
      </CardContent>
    </Card>
  );
}
