"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { aiStatusQuery } from "@/lib/api/ai";
import { qk } from "@/lib/api/keys";
import { useUpdateSettings } from "@/lib/api/queries";
import type { Settings } from "@/lib/api/types";

/** AI assistant on/off for this user. Hidden until the admin has set AI up. */
export function AiSettingsCard({ settings }: { settings: Settings }) {
  const status = useQuery(aiStatusQuery);
  const update = useUpdateSettings();
  const qc = useQueryClient();
  if (!status.data?.configured) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden /> AI assistant
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="ai-enabled">Use the AI assistant</FieldLabel>
            <FieldDescription>
              Summaries and reply drafts. Email text is sent to the AI service; nothing is sent without your OK.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="ai-enabled"
            checked={settings.ai_enabled && status.data.enabled_for_me}
            disabled={update.isPending}
            onCheckedChange={(v) =>
              update.mutate(
                { ai_enabled: v },
                {
                  onSuccess: () => {
                    void qc.invalidateQueries({ queryKey: qk.aiStatus });
                    toast.success(v ? "AI assistant is on" : "AI assistant is off");
                  },
                },
              )
            }
          />
        </Field>
      </CardContent>
    </Card>
  );
}
