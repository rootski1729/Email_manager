"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Inbox, MessageCircle, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, errorMessage } from "@/lib/api/errors";
import {
  destinationsQuery,
  mailboxesQuery,
  ruleFieldsQuery,
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from "@/lib/api/queries";
import type { Rule, RuleTestHit } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import { summarizeCondition } from "@/lib/rules/summary";
import { measure, rootFromJson, toJson, validateTree, type GroupNode } from "@/lib/rules/tree";
import { LIMITS, type ActionsJson } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { BuilderContext } from "./builder-context";
import { ConditionGroup } from "./condition-group";
import { TestPanel } from "./test-panel";
import { WhatsAppPreview } from "./whatsapp-preview";

interface EditorState {
  name: string;
  description: string;
  enabled: boolean;
  stopProcessing: boolean;
  scopeAll: boolean;
  mailboxIds: string[];
  destinations: string[];
  mode: "instant" | "digest";
  root: GroupNode;
}

function initialState(rule?: Rule): EditorState {
  const actions = (rule?.actions ?? {}) as ActionsJson;
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    enabled: rule?.enabled ?? true,
    stopProcessing: rule?.stop_processing ?? false,
    scopeAll: !rule?.mailbox_ids || rule.mailbox_ids.length === 0,
    mailboxIds: rule?.mailbox_ids ?? [],
    destinations: actions.notify?.destinations ?? [],
    mode: actions.notify?.mode ?? "instant",
    root: rootFromJson(rule?.condition),
  };
}

function snapshot(s: EditorState) {
  return JSON.stringify({ ...s, root: toJson(s.root) });
}

export function RuleEditor({ rule }: { rule?: Rule }) {
  const router = useRouter();
  const fields = useQuery(ruleFieldsQuery);
  const mailboxes = useQuery(mailboxesQuery);
  const destinations = useQuery(destinationsQuery);
  const create = useCreateRule({ silent: true });
  const update = useUpdateRule({ silent: true });
  const remove = useDeleteRule();

  const [state, setState] = useState<EditorState>(() => initialState(rule));
  const [baseline, setBaseline] = useState(() => snapshot(initialState(rule)));
  const [showIssues, setShowIssues] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<{ hit: RuleTestHit | null; mailbox: string | null }>({ hit: null, mailbox: null });

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const conditionJson = useMemo(() => toJson(state.root), [state.root]);
  const size = useMemo(() => measure(conditionJson), [conditionJson]);
  const validation = useMemo(() => validateTree(state.root, fields.data ?? []), [state.root, fields.data]);
  const dirty = snapshot(state) !== baseline;
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const builder = useMemo(
    () => ({
      root: state.root,
      setRoot: (fn: (r: GroupNode) => GroupNode) => setState((s) => ({ ...s, root: fn(s.root) })),
      fields: fields.data ?? [],
      issues: validation.issues,
      showIssues,
      nodeCount: size.nodes,
    }),
    [state.root, fields.data, validation.issues, showIssues, size.nodes],
  );

  function buildConditionForTest() {
    const hasIssues = Object.keys(validation.issues).length > 0 || validation.global.length > 0;
    if (hasIssues) {
      setShowIssues(true);
      return null;
    }
    return conditionJson;
  }

  async function save() {
    setApiError(null);
    const name = state.name.trim();
    const hasIssues = Object.keys(validation.issues).length > 0 || validation.global.length > 0;
    const nErr = name ? null : "Give this rule a name.";
    const sErr = !state.scopeAll && state.mailboxIds.length === 0 ? "Choose at least one mailbox, or apply to all." : null;
    setNameError(nErr);
    setScopeError(sErr);
    if (hasIssues) setShowIssues(true);
    if (nErr || sErr || hasIssues) {
      toast.error("Fix the highlighted fields to save this rule.");
      return;
    }
    const body = {
      name,
      description: state.description.trim() || null,
      enabled: state.enabled,
      stop_processing: state.stopProcessing,
      mailbox_ids: state.scopeAll ? null : state.mailboxIds,
      condition: conditionJson,
      actions: { notify: { destinations: state.destinations, mode: state.mode } },
    };
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, body });
        setBaseline(snapshot(state));
        toast.success("Rule saved");
      } else {
        const created = await create.mutateAsync(body);
        setBaseline(snapshot(state));
        toast.success("Rule created", { description: "It applies to new mail from now on." });
        router.replace(`/rules/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        const nameFe = fe.find((e) => e.path === "name");
        if (nameFe) setNameError(nameFe.message);
        const rest = fe.filter((e) => e.path !== "name");
        setApiError(rest.length ? rest.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join("\n") : err.detail);
      } else {
        setApiError(errorMessage(err));
      }
      toast.error("Couldn't save the rule");
    }
  }

  const verifiedDestinations = (destinations.data ?? []).filter((d) => d.verified_at);
  const unverified = (destinations.data ?? []).filter((d) => !d.verified_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href="/rules">
              <ArrowLeft /> Rules
            </Link>
          </Button>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {rule ? state.name.trim() || rule.name : "New rule"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span> : null}
          {rule ? (
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button onClick={() => void save()} disabled={saving || (!!rule && !dirty)}>
            {saving ? <Spinner /> : <Save />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </div>

      {apiError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The server rejected this rule</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{apiError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field data-invalid={Boolean(nameError) || undefined}>
                <FieldLabel htmlFor="rule-name">Name</FieldLabel>
                <Input
                  id="rule-name"
                  value={state.name}
                  maxLength={120}
                  placeholder="University exam notices"
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  aria-invalid={Boolean(nameError) || undefined}
                />
                <FieldDescription>Shown in every WhatsApp alert this rule sends.</FieldDescription>
                {nameError ? <FieldError>{nameError}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="rule-desc">Description</FieldLabel>
                <Textarea
                  id="rule-desc"
                  rows={2}
                  maxLength={1000}
                  value={state.description}
                  placeholder="Optional note for yourself"
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field orientation="horizontal" className="rounded-lg border p-3">
                  <FieldContent>
                    <FieldLabel htmlFor="rule-enabled">Enabled</FieldLabel>
                    <FieldDescription>Disabled rules never match.</FieldDescription>
                  </FieldContent>
                  <Switch id="rule-enabled" checked={state.enabled} onCheckedChange={(v) => set("enabled", v)} />
                </Field>
                <Field orientation="horizontal" className="rounded-lg border p-3">
                  <FieldContent>
                    <FieldLabel htmlFor="rule-stop">Stop processing</FieldLabel>
                    <FieldDescription>When this matches, skip rules below it.</FieldDescription>
                  </FieldContent>
                  <Switch id="rule-stop" checked={state.stopProcessing} onCheckedChange={(v) => set("stopProcessing", v)} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
              <CardDescription className="line-clamp-2">
                <span className="text-foreground/80">Matches when </span>
                {summarizeCondition(conditionJson)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.isPending ? (
                <Skeleton className="h-40 w-full rounded-xl" />
              ) : (
                <BuilderContext.Provider value={builder}>
                  <ConditionGroup node={state.root} depth={1} isRoot />
                </BuilderContext.Provider>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular">
                  {size.nodes}/{LIMITS.maxNodes} nodes · depth {size.depth}/{LIMITS.maxDepth}
                </span>
                <span>Case-insensitive unless you toggle Aa. Fields marked with a page icon read the full message.</span>
              </div>
              {showIssues && validation.global.length ? (
                <Alert variant="destructive">
                  <AlertDescription>{validation.global.join(" ")}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="size-4 text-muted-foreground" /> Applies to
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={state.scopeAll ? "all" : "selected"}
                onValueChange={(v) => {
                  set("scopeAll", v === "all");
                  setScopeError(null);
                }}
                className="gap-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="all" /> All mailboxes, including ones you connect later
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="selected" /> Only selected mailboxes
                </label>
              </RadioGroup>
              {!state.scopeAll ? (
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {(mailboxes.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No mailboxes connected yet.</p>
                  ) : (
                    (mailboxes.data ?? []).map((m) => (
                      <label key={m.id} className="flex min-w-0 items-center gap-2 text-sm">
                        <Checkbox
                          checked={state.mailboxIds.includes(m.id)}
                          onCheckedChange={(v) => {
                            setScopeError(null);
                            set(
                              "mailboxIds",
                              v ? [...state.mailboxIds, m.id] : state.mailboxIds.filter((x) => x !== m.id),
                            );
                          }}
                        />
                        <span className="truncate">{m.display_name || m.address}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
              {scopeError ? <p className="text-sm text-destructive">{scopeError}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="size-4 text-muted-foreground" /> Notify
              </CardTitle>
              <CardDescription>Leave everything unchecked to use your default WhatsApp destination.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {verifiedDestinations.map((d) => (
                  <label
                    key={d.id}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-lg border p-2.5 text-sm",
                      state.destinations.includes(d.id) && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={state.destinations.includes(d.id)}
                      onCheckedChange={(v) =>
                        set(
                          "destinations",
                          v ? [...state.destinations, d.id] : state.destinations.filter((x) => x !== d.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{chatIdToDisplay(d.chat_id)}</span>
                    </span>
                    {d.is_default ? <Badge variant="secondary">Default</Badge> : null}
                  </label>
                ))}
                {destinations.isPending ? <Skeleton className="h-12 w-full" /> : null}
              </div>
              {unverified.length ? (
                <p className="text-xs text-muted-foreground">
                  {unverified.length} unverified destination{unverified.length > 1 ? "s are" : " is"} hidden.{" "}
                  <Link href="/destinations" className="underline underline-offset-2">
                    Verify on the WhatsApp page
                  </Link>
                  .
                </p>
              ) : null}
              <Field>
                <FieldLabel>Delivery</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={state.mode}
                  onValueChange={(v) => v && set("mode", v as "instant" | "digest")}
                  className="w-full sm:w-auto"
                >
                  <ToggleGroupItem value="instant" className="flex-1 px-4">
                    Instant
                  </ToggleGroupItem>
                  <ToggleGroupItem value="digest" className="flex-1 px-4">
                    Daily digest
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {state.mode === "instant"
                    ? "Each match is sent within seconds (quiet hours still apply)."
                    : "Matches are collected and sent together at your digest time."}
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-20">
          <TestPanel
            buildCondition={buildConditionForTest}
            onResult={(r, mailbox) =>
              setPreview({ hit: r?.results.find((h) => h.matched) ?? null, mailbox })
            }
          />
          <WhatsAppPreview ruleName={state.name} hit={preview.hit} mailbox={preview.mailbox} mode={state.mode} />
        </aside>
      </div>

      {rule ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete “${rule.name}”?`}
          description="The rule stops matching immediately. Emails it already matched stay in your history."
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(rule.id, {
              onSuccess: () => {
                setBaseline(snapshot(state));
                toast.success("Rule deleted");
                router.replace("/rules");
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
