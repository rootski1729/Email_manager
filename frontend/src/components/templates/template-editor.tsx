"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Braces, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { TagInput } from "@/components/rules/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api/errors";
import {
  mailboxesQuery,
  templatePreviewQuery,
  useCreateTemplate,
  useDeleteTemplate,
  useUpdateTemplate,
} from "@/lib/api/queries";
import type { EmailTemplate } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  EMAIL_PATTERN,
  fillPlaceholders,
  PLACEHOLDERS,
  pickMailbox,
  renderForm,
  sendingMailboxes,
  slugifyTemplateName,
  TEMPLATE_NAME_MAX,
  TEMPLATE_NAME_PATTERN,
} from "@/lib/compose";
import { useNow } from "@/lib/hooks/use-now";
import { TemplatePreviewCard } from "./template-preview";

const FIRST_AVAILABLE = "__first";
const MAX_RECIPIENTS = 50;

interface State {
  name: string;
  description: string;
  mailboxId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  isDefault: boolean;
}

type FieldKey = "name" | "description" | "mailbox" | "to" | "cc" | "bcc" | "subject" | "body";

function initial(t?: EmailTemplate): State {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    mailboxId: t?.mailbox_id ?? FIRST_AVAILABLE,
    to: t?.to_addresses ?? [],
    cc: t?.cc_addresses ?? [],
    bcc: t?.bcc_addresses ?? [],
    subject: t?.subject ?? "",
    body: t?.body ?? "",
    isDefault: t?.is_default ?? false,
  };
}

const isBadEmail = (v: string) => !EMAIL_PATTERN.test(v);

function validate(s: State): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (!s.name) e.name = "Give the template a name.";
  else if (!TEMPLATE_NAME_PATTERN.test(s.name))
    e.name = "Use lower-case letters, digits, dashes or underscores, starting with a letter or digit.";
  for (const [key, list] of [["to", s.to], ["cc", s.cc], ["bcc", s.bcc]] as const) {
    const bad = list.filter(isBadEmail);
    if (bad.length) e[key] = `Not a valid email address: ${bad.join(", ")}`;
    else if (list.length > MAX_RECIPIENTS) e[key] = `At most ${MAX_RECIPIENTS} addresses.`;
  }
  if (s.description.length > 200) e.description = "At most 200 characters.";
  if (s.subject.length > 500) e.subject = "At most 500 characters.";
  if (s.body.length > 20000) e.body = "At most 20,000 characters.";
  return e;
}

const FIELD_FROM_PATH: Record<string, FieldKey> = {
  name: "name",
  description: "description",
  mailbox_id: "mailbox",
  to_addresses: "to",
  cc_addresses: "cc",
  bcc_addresses: "bcc",
  subject: "subject",
  body: "body",
};

export function TemplateEditor({ template }: { template?: EmailTemplate }) {
  const router = useRouter();
  const { user } = useAuth();
  const mailboxes = useQuery(mailboxesQuery);
  const preview = useQuery({ ...templatePreviewQuery(template?.id ?? ""), enabled: Boolean(template) });
  const create = useCreateTemplate();
  const update = useUpdateTemplate({ silent: true });
  const remove = useDeleteTemplate();
  const now = useNow();

  const [state, setState] = useState<State>(() => initial(template));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial(template)));
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const dirty = JSON.stringify(state) !== baseline;
  const clientErrors = useMemo(() => validate(state), [state]);
  const errors = { ...(touched ? clientErrors : {}), ...serverErrors };
  // Recipient chips are validated as you type, regardless of submit state.
  for (const k of ["to", "cc", "bcc"] as const) if (clientErrors[k]) errors[k] = clientErrors[k];
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }));
    const fieldKey = (key === "mailboxId" ? "mailbox" : key) as FieldKey;
    if (serverErrors[fieldKey]) setServerErrors((e) => ({ ...e, [fieldKey]: undefined }));
  }

  function insertPlaceholder(token: string) {
    const text = `{{${token}}}`;
    const target = lastFocused.current;
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    const current = target === "subject" ? state.subject : state.body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    set(target, next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const usable = sendingMailboxes(mailboxes.data ?? []);
  const selectedUnusable =
    state.mailboxId !== FIRST_AVAILABLE && !usable.some((m) => m.id === state.mailboxId)
      ? (mailboxes.data ?? []).find((m) => m.id === state.mailboxId)
      : undefined;
  const fromMailbox = pickMailbox(mailboxes.data ?? [], state.mailboxId === FIRST_AVAILABLE ? null : state.mailboxId);

  const timeZone = user?.timezone ?? "UTC";
  const fill = (text: string) => (now ? fillPlaceholders(text, { now: new Date(now), timeZone, name: user?.display_name }) : text);
  const clientForm = renderForm({
    fromAddress: fromMailbox?.address ?? "",
    to: state.to,
    cc: state.cc,
    bcc: state.bcc,
    subject: fill(state.subject),
    body: fill(state.body),
  });
  const useServerPreview = Boolean(template && !dirty && preview.data);
  const commandName = state.name || "name";

  async function save() {
    setTouched(true);
    setApiError(null);
    setServerErrors({});
    if (Object.keys(clientErrors).length) {
      toast.error("Fix the highlighted fields to save this template.");
      return;
    }
    const body = {
      name: state.name,
      description: state.description.trim() || null,
      mailbox_id: state.mailboxId === FIRST_AVAILABLE ? null : state.mailboxId,
      to_addresses: state.to,
      cc_addresses: state.cc,
      bcc_addresses: state.bcc,
      subject: state.subject,
      body: state.body,
      is_default: state.isDefault,
    };
    try {
      if (template) {
        const saved = await update.mutateAsync({ id: template.id, body });
        setState(initial(saved));
        setBaseline(JSON.stringify(initial(saved)));
        toast.success("Template saved");
      } else {
        const created = await create.mutateAsync(body);
        setBaseline(JSON.stringify(state));
        toast.success("Template created", { description: `Send /email ${created.name} on WhatsApp to use it.` });
        router.replace(`/templates/${created.id}`);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setApiError(errorMessage(err));
        return;
      }
      if (err.status === 409) {
        setServerErrors({ name: err.detail });
      } else if (err.code === "mailbox_cannot_send" || err.code === "invalid_reference") {
        setServerErrors({ mailbox: err.detail });
      } else if (err.code === "plan_limit") {
        setApiError(`${err.detail}. Delete a template you no longer use to add a new one.`);
      } else if (err.status === 422 && err.errors.length) {
        const mapped: Partial<Record<FieldKey, string>> = {};
        const rest: string[] = [];
        for (const fe of err.fieldErrors()) {
          const key = FIELD_FROM_PATH[fe.path.split(".")[0]];
          if (key) mapped[key] = fe.message;
          else rest.push(fe.path ? `${fe.path}: ${fe.message}` : fe.message);
        }
        setServerErrors(mapped);
        if (rest.length) setApiError(rest.join("\n"));
      } else {
        setApiError(err.detail);
      }
      toast.error("Couldn't save the template");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href="/templates">
              <ArrowLeft /> Send email
            </Link>
          </Button>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {template ? <span className="font-mono">/email {template.name}</span> : "New template"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span> : null}
          {template ? (
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button onClick={() => void save()} disabled={saving || (Boolean(template) && !dirty)}>
            {saving ? <Spinner /> : <Save />}
            {template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>

      {apiError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t save</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{apiError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field data-invalid={Boolean(errors.name) || undefined}>
                <FieldLabel htmlFor="tpl-name">Name</FieldLabel>
                <div className="flex items-center rounded-lg border border-input font-mono text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive dark:bg-input/15">
                  <span className="pl-2.5 text-muted-foreground select-none">/email&nbsp;</span>
                  <Input
                    id="tpl-name"
                    value={state.name}
                    maxLength={TEMPLATE_NAME_MAX}
                    placeholder="leave"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => set("name", slugifyTemplateName(e.target.value))}
                    className="border-0 pl-0 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
                    aria-invalid={Boolean(errors.name) || undefined}
                    aria-describedby="tpl-name-hint"
                  />
                </div>
                {errors.name ? (
                  <FieldError>{errors.name}</FieldError>
                ) : (
                  <FieldDescription id="tpl-name-hint">
                    Send <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">/email {commandName}</code> on
                    WhatsApp. Lower-case letters, digits, dashes and underscores.
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={Boolean(errors.description) || undefined}>
                <FieldLabel htmlFor="tpl-desc">Description</FieldLabel>
                <Input
                  id="tpl-desc"
                  value={state.description}
                  maxLength={200}
                  placeholder="Leave request to my manager"
                  onChange={(e) => set("description", e.target.value)}
                />
                {errors.description ? <FieldError>{errors.description}</FieldError> : null}
              </Field>
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent>
                  <FieldLabel htmlFor="tpl-default">Default template</FieldLabel>
                  <FieldDescription>A plain /email uses this template.</FieldDescription>
                </FieldContent>
                <Switch id="tpl-default" checked={state.isDefault} onCheckedChange={(v) => set("isDefault", v)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email</CardTitle>
              <CardDescription>Everything here is pre-filled in the form. You can still edit it on WhatsApp before sending.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field data-invalid={Boolean(errors.mailbox || selectedUnusable) || undefined}>
                <FieldLabel htmlFor="tpl-from">From</FieldLabel>
                {mailboxes.isPending ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <Select value={state.mailboxId} onValueChange={(v) => set("mailboxId", v)}>
                    <SelectTrigger id="tpl-from" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FIRST_AVAILABLE}>
                        First available{usable[0] ? ` (${usable[0].address})` : ""}
                      </SelectItem>
                      {usable.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.display_name ? `${m.display_name} · ${m.address}` : m.address}
                        </SelectItem>
                      ))}
                      {selectedUnusable ? (
                        <SelectItem value={selectedUnusable.id} disabled>
                          {selectedUnusable.address} (can&apos;t send)
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                )}
                {errors.mailbox ? (
                  <FieldError>{errors.mailbox}</FieldError>
                ) : selectedUnusable ? (
                  <FieldError>
                    {selectedUnusable.address} can&apos;t send right now. Pick another mailbox, or allow sending on it.
                  </FieldError>
                ) : usable.length === 0 && mailboxes.data ? (
                  <FieldDescription>
                    No mailbox can send yet.{" "}
                    <Link href="/mailboxes" className="underline underline-offset-2">
                      Allow sending on a mailbox
                    </Link>
                    .
                  </FieldDescription>
                ) : (
                  <FieldDescription>Only mailboxes that can send are listed.</FieldDescription>
                )}
              </Field>

              {(
                [
                  ["to", "To", "manager@example.com"],
                  ["cc", "Cc", "Optional"],
                  ["bcc", "Bcc", "Optional"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Field key={key} data-invalid={Boolean(errors[key]) || undefined}>
                  <FieldLabel htmlFor={`tpl-${key}`}>{label}</FieldLabel>
                  <TagInput
                    id={`tpl-${key}`}
                    values={state[key]}
                    onChange={(v) => set(key, v)}
                    placeholder={placeholder}
                    max={MAX_RECIPIENTS}
                    ariaLabel={`${label} addresses`}
                    invalid={Boolean(errors[key])}
                    isValueInvalid={isBadEmail}
                    normalize={(v) => v.replace(/^mailto:/i, "").replace(/^<|>$/g, "")}
                  />
                  {errors[key] ? <FieldError>{errors[key]}</FieldError> : null}
                </Field>
              ))}

              <Field data-invalid={Boolean(errors.subject) || undefined}>
                <FieldLabel htmlFor="tpl-subject">Subject</FieldLabel>
                <Input
                  id="tpl-subject"
                  ref={subjectRef}
                  value={state.subject}
                  maxLength={500}
                  placeholder="Leave request – {{date}}"
                  onFocus={() => {
                    lastFocused.current = "subject";
                  }}
                  onChange={(e) => set("subject", e.target.value)}
                />
                {errors.subject ? <FieldError>{errors.subject}</FieldError> : null}
              </Field>

              <Field data-invalid={Boolean(errors.body) || undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor="tpl-body">Body</FieldLabel>
                  <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Insert placeholder">
                    <Braces className="size-3.5 text-muted-foreground" aria-hidden />
                    {PLACEHOLDERS.map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant="outline"
                        size="xs"
                        className="font-mono"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertPlaceholder(p)}
                        aria-label={`Insert {{${p}}}`}
                      >
                        {`{{${p}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
                <Textarea
                  id="tpl-body"
                  ref={bodyRef}
                  rows={9}
                  maxLength={20000}
                  value={state.body}
                  placeholder={"Hi,\n\nI'd like to request leave on {{date}}.\n\nThanks,\n{{name}}"}
                  onFocus={() => {
                    lastFocused.current = "body";
                  }}
                  onChange={(e) => set("body", e.target.value)}
                />
                {errors.body ? (
                  <FieldError>{errors.body}</FieldError>
                ) : (
                  <FieldDescription>
                    <code className="font-mono">{"{{date}}"}</code>, <code className="font-mono">{"{{time}}"}</code> and{" "}
                    <code className="font-mono">{"{{name}}"}</code> are filled in when the bot sends the form. Insert
                    buttons add to the subject or body, whichever you used last.
                  </FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-20">
          {template && !dirty && preview.isPending ? (
            <Skeleton className="h-[520px] rounded-xl" />
          ) : (
            <TemplatePreviewCard
              command={useServerPreview && preview.data ? preview.data.command : `/email ${commandName}`}
              instructions={useServerPreview && preview.data ? preview.data.instructions : undefined}
              form={useServerPreview && preview.data ? preview.data.form : clientForm}
              exact={useServerPreview}
            />
          )}
        </aside>
      </div>

      {template ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete “${template.name}”?`}
          description={`/email ${template.name} will stop working. Emails already sent are not affected.`}
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(template.id, {
              onSuccess: () => {
                setBaseline(JSON.stringify(state));
                toast.success("Template deleted");
                router.replace("/templates");
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
