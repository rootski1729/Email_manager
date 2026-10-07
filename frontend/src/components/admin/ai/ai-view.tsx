"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckResults } from "@/components/admin/common/check-results";
import { ToneBadge } from "@/components/admin/common/tone-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { aiConfigQuery, useCheckAi, useResetAi, useSaveAi } from "@/lib/admin/queries";
import type { AIConfigOut } from "@/lib/admin/types";

interface Form {
  endpoint: string;
  model: string;
  enabled: boolean;
  api_key: string;
}

function toForm(c: AIConfigOut): Form {
  return { endpoint: c.endpoint, model: c.model, enabled: c.enabled, api_key: "" };
}

function AiForm({ config }: { config: AIConfigOut }) {
  const save = useSaveAi();
  const reset = useResetAi();
  const check = useCheckAi();
  const initial = toForm(config);
  const [form, setForm] = useState<Form>(initial);
  const [confirmReset, setConfirmReset] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = (Object.keys(initial) as (keyof Form)[]).some((k) => form[k] !== initial[k]);

  const submit = () =>
    save.mutate(
      {
        endpoint: form.endpoint.trim(),
        model: form.model.trim(),
        enabled: form.enabled,
        api_key: form.api_key.trim() ? form.api_key.trim() : null,
      },
      {
        onSuccess: () => {
          toast.success("AI settings saved");
          check.reset();
        },
      },
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form
            id="ai-config"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ai-endpoint">Endpoint</FieldLabel>
                <Input
                  id="ai-endpoint"
                  type="url"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="https://NAME.openai.azure.com"
                  maxLength={500}
                  value={form.endpoint}
                  onChange={(e) => set("endpoint", e.target.value)}
                />
                <FieldDescription>Azure AI Foundry or Azure OpenAI endpoint, e.g. https://NAME.openai.azure.com</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-model">Deployment / model name</FieldLabel>
                <Input
                  id="ai-model"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="gpt-4.1-mini"
                  maxLength={200}
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-key" className="flex items-center gap-2">
                  API key
                  {config.api_key_set ? <ToneBadge tone="success">Saved ✓</ToneBadge> : null}
                </FieldLabel>
                <Input
                  id="ai-key"
                  type="password"
                  autoComplete="new-password"
                  maxLength={500}
                  placeholder={config.api_key_set ? "Saved, leave blank to keep" : "Paste the key"}
                  value={form.api_key}
                  onChange={(e) => set("api_key", e.target.value)}
                />
                <FieldDescription>For safety the saved key is never shown again.</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="ai-enabled">Enabled</FieldLabel>
                  <FieldDescription>Clients can turn the assistant on in their Settings.</FieldDescription>
                </FieldContent>
                <Switch id="ai-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-md">
        <Button type="submit" form="ai-config" disabled={!dirty || save.isPending}>
          {save.isPending ? <Spinner /> : <Save />} Save
        </Button>
        <Button
          variant="outline"
          disabled={check.isPending || dirty}
          title={dirty ? "Save your changes first" : undefined}
          onClick={() => check.mutate()}
        >
          {check.isPending ? <Spinner /> : <ShieldCheck />} Test
        </Button>
        {dirty ? <span className="text-xs text-muted-foreground">You have unsaved changes.</span> : null}
        {config.source === "database" ? (
          <Button variant="ghost" className="text-destructive sm:ml-auto" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Reset
          </Button>
        ) : null}
      </div>

      {check.data ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Test results</h2>
          <CheckResults results={check.data} />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to environment values?"
        description="The values saved here, including the API key, are forgotten and MailSentinel goes back to its environment variables."
        confirmLabel="Reset"
        pending={reset.isPending}
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: () => {
              toast.success("Back to environment values");
              setConfirmReset(false);
              check.reset();
            },
          })
        }
      />
    </div>
  );
}

/** Remount the form only when saved values change. */
function formKey(c: AIConfigOut): string {
  return JSON.stringify([c.source, c.api_key_set, toForm(c)]);
}

export function AiView() {
  const q = useQuery(aiConfigQuery);
  const c = q.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI assistant"
        description="Summaries in alerts, reply drafts and questions about mail, using your Azure AI deployment."
        className="pb-0"
      >
        {c ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <ToneBadge tone={c.ready ? "success" : "warning"}>{c.ready ? "Ready" : "Not set up"}</ToneBadge>
            {!c.enabled ? <ToneBadge tone="neutral">Switched off</ToneBadge> : null}
            <ToneBadge tone="neutral">
              {c.source === "database" ? "Using values saved here" : "Using environment variables"}
            </ToneBadge>
          </div>
        ) : null}
      </PageHeader>
      {q.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <AiForm key={formKey(q.data)} config={q.data} />
      )}
    </div>
  );
}
