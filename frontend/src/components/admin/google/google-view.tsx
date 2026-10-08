"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckResults } from "@/components/admin/common/check-results";
import { ToneBadge } from "@/components/admin/common/tone-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { googleQuery, useCheckGoogle, useResetGoogle, useSaveGoogle } from "@/lib/admin/queries";
import type { GoogleConfigIn, GoogleConfigOut } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

function Step({ n, title, description, children }: { n: number; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {n}
        </span>
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </CardHeader>
      <CardContent className="sm:pl-16">{children}</CardContent>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs break-all">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function toInput(c: GoogleConfigOut): GoogleConfigIn {
  return {
    client_id: c.client_id,
    client_secret: "",
    project_id: c.project_id,
    pubsub_topic: c.pubsub_topic,
    pubsub_subscription: c.pubsub_subscription,
    push_mode: c.push_mode,
    push_audience: c.push_audience,
    push_service_account: c.push_service_account,
  };
}

function GoogleForm({ config }: { config: GoogleConfigOut }) {
  const save = useSaveGoogle();
  const reset = useResetGoogle();
  const check = useCheckGoogle();
  const initial = toInput(config);
  const [form, setForm] = useState<GoogleConfigIn>(initial);
  const [advanced, setAdvanced] = useState(Boolean(config.project_id || config.pubsub_topic));
  const [confirmReset, setConfirmReset] = useState(false);

  const set = <K extends keyof GoogleConfigIn>(key: K, value: GoogleConfigIn[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = (Object.keys(initial) as (keyof GoogleConfigIn)[]).some((k) => (form[k] ?? "") !== (initial[k] ?? ""));

  const submit = () =>
    save.mutate(
      {
        ...form,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret?.trim() ? form.client_secret.trim() : null,
        project_id: form.project_id.trim(),
        pubsub_topic: form.pubsub_topic.trim(),
        pubsub_subscription: form.pubsub_subscription.trim(),
        push_audience: form.push_audience.trim(),
        push_service_account: form.push_service_account.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Gmail settings saved");
          check.reset();
        },
      },
    );

  return (
    <div className="space-y-6">
      <Step
        n={1}
        title="Create an OAuth client in Google Cloud"
        description="This lets clients connect Gmail with one click."
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink> and
            press <span className="font-medium">Enable</span>.
          </li>
          <li>
            Set up the <ExtLink href="https://console.cloud.google.com/auth/branding">OAuth consent screen</ExtLink> (app
            name, support email).
          </li>
          <li>
            Go to <ExtLink href="https://console.cloud.google.com/apis/credentials">Credentials</ExtLink> →{" "}
            <span className="font-medium">Create credentials → OAuth client ID</span> and choose{" "}
            <span className="font-medium">Web application</span>.
          </li>
        </ol>
      </Step>

      <Step n={2} title="Tell Google where MailSentinel lives" description="Paste these into the OAuth client you just created.">
        <div className="space-y-4">
          <CopyRow label="Authorised redirect URI" value={config.redirect_uri} />
          <CopyRow label="Authorised JavaScript origin" value={config.javascript_origin} />
        </div>
      </Step>

      <Step n={3} title="Paste the Client ID and Secret" description="Google shows both after you create the client.">
        <form
          id="google-config"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="g-client-id">Client ID</FieldLabel>
              <Input
                id="g-client-id"
                placeholder="1234567890-abc.apps.googleusercontent.com"
                spellCheck={false}
                autoComplete="off"
                value={form.client_id}
                onChange={(e) => set("client_id", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-client-secret" className="flex items-center gap-2">
                Client secret
                {config.client_secret_set ? <ToneBadge tone="success">Saved ✓</ToneBadge> : null}
              </FieldLabel>
              <Input
                id="g-client-secret"
                type="password"
                autoComplete="new-password"
                placeholder={config.client_secret_set ? "Leave blank to keep the saved secret" : "GOCSPX-…"}
                value={form.client_secret ?? ""}
                onChange={(e) => set("client_secret", e.target.value)}
              />
              <FieldDescription>For safety the saved secret is never shown again.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </Step>

      <Collapsible open={advanced} onOpenChange={setAdvanced}>
        <Card>
          <CardHeader className="flex flex-row items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              4
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle>Instant updates (optional)</CardTitle>
              <CardDescription>
                Without this, Gmail is checked every 5 minutes. With Google Pub/Sub, new mail arrives in seconds.
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={advanced ? "Hide advanced settings" : "Show advanced settings"}>
                Advanced <ChevronDown className={cn("transition-transform", advanced && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="sm:pl-16">
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="g-project">Project ID</FieldLabel>
                    <Input id="g-project" spellCheck={false} value={form.project_id} onChange={(e) => set("project_id", e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="g-topic">Pub/Sub topic</FieldLabel>
                    <Input
                      id="g-topic"
                      spellCheck={false}
                      placeholder="projects/my-project/topics/gmail"
                      value={form.pubsub_topic}
                      onChange={(e) => set("pubsub_topic", e.target.value)}
                    />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="g-sub">Pub/Sub subscription</FieldLabel>
                    <Input
                      id="g-sub"
                      spellCheck={false}
                      placeholder="projects/my-project/subscriptions/gmail-sub"
                      value={form.pubsub_subscription}
                      onChange={(e) => set("pubsub_subscription", e.target.value)}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>How updates arrive</FieldLabel>
                  <RadioGroup
                    value={form.push_mode}
                    onValueChange={(v) => set("push_mode", v as GoogleConfigIn["push_mode"])}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {(
                      [
                        ["pull", "Pull (simplest)", "A small listener asks Google for new mail. Needs the gmail-listener container."],
                        ["push", "Push", "Google calls MailSentinel directly. Needs a public HTTPS address."],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <Field key={value} orientation="horizontal" className="rounded-lg border p-3">
                        <RadioGroupItem value={value} id={`g-mode-${value}`} />
                        <FieldContent>
                          <FieldLabel htmlFor={`g-mode-${value}`}>{label}</FieldLabel>
                          <FieldDescription>{hint}</FieldDescription>
                        </FieldContent>
                      </Field>
                    ))}
                  </RadioGroup>
                </Field>
                {form.push_mode === "push" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="g-aud">Push audience</FieldLabel>
                      <Input id="g-aud" spellCheck={false} value={form.push_audience} onChange={(e) => set("push_audience", e.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="g-sa">Push service account</FieldLabel>
                      <Input
                        id="g-sa"
                        spellCheck={false}
                        placeholder="pubsub-push@my-project.iam.gserviceaccount.com"
                        value={form.push_service_account}
                        onChange={(e) => set("push_service_account", e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}
              </FieldGroup>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-md">
        <Button type="submit" form="google-config" disabled={!dirty || save.isPending}>
          {save.isPending ? <Spinner /> : <Save />} Save
        </Button>
        <Button
          variant="outline"
          disabled={check.isPending || dirty}
          title={dirty ? "Save your changes first" : undefined}
          onClick={() => check.mutate()}
        >
          {check.isPending ? <Spinner /> : <ShieldCheck />} Check configuration
        </Button>
        {dirty ? <span className="text-xs text-muted-foreground">You have unsaved changes.</span> : null}
        {config.source === "database" ? (
          <Button variant="ghost" className="text-destructive sm:ml-auto" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Reset to environment values
          </Button>
        ) : null}
      </div>

      {check.data ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Check results</h2>
          <CheckResults results={check.data} />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to environment values?"
        description="The values saved here are forgotten and MailSentinel goes back to the GOOGLE_* environment variables. Connected Gmail mailboxes may need to reconnect if the client changes."
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

/** Remount the form only when saved values change, not when readiness flags refresh. */
function formKey(c: GoogleConfigOut): string {
  return JSON.stringify([c.source, c.client_secret_set, toInput(c)]);
}

export function GoogleView() {
  const q = useQuery(googleQuery);
  const c = q.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Gmail setup"
        description="Connect MailSentinel to Google so clients can link Gmail in one click."
        className="pb-0"
      >
        {c ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <ToneBadge tone={c.oauth_ready ? "success" : "warning"}>
              {c.oauth_ready ? "Gmail sign-in ready" : "Gmail sign-in not set up"}
            </ToneBadge>
            <ToneBadge tone={c.push_ready ? (c.push_mode === "push" || c.listener_online ? "success" : "warning") : "neutral"}>
              {c.push_ready
                ? c.push_mode === "push"
                  ? "Instant updates: push"
                  : c.listener_online
                    ? "Instant updates running"
                    : "Instant updates: listener offline"
                : "Instant updates off (checks every 5 min)"}
            </ToneBadge>
            <ToneBadge tone="neutral">
              {c.source === "database" ? "Using values saved here" : "Using environment variables"}
            </ToneBadge>
          </div>
        ) : null}
      </PageHeader>
      {q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <GoogleForm key={formKey(q.data)} config={q.data} />
      )}
    </div>
  );
}
