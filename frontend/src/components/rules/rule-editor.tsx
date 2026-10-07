"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Save, Siren, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, errorMessage } from "@/lib/api/errors";
import {
  destinationsQuery,
  mailboxesQuery,
  ruleFieldsQuery,
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from "@/lib/api/queries";
import type { Rule, RuleIdea, RuleTestHit } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import {
  EMPTY_SIMPLE,
  isValidSender,
  normalizeSender,
  simpleFromJson,
  simpleIsEmpty,
  simpleToJson,
  validateSimple,
  type SimpleRule,
} from "@/lib/rules/simple";
import { plainSummary } from "@/lib/rules/summary";
import { measure, rootFromJson, toJson, validateTree, type GroupNode } from "@/lib/rules/tree";
import { LIMITS, type ActionsJson } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { AiRuleBox } from "./ai-rule-box";
import { BuilderContext } from "./builder-context";
import { ConditionGroup } from "./condition-group";
import { TagInput } from "./tag-input";
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
  urgent: boolean;
  /** Which editor is showing: the three-box simple form or the nested builder. */
  editor: "simple" | "advanced";
  simple: SimpleRule;
  root: GroupNode;
}

function initialState(rule?: Rule): EditorState {
  const actions = (rule?.actions ?? {}) as ActionsJson;
  const simple = simpleFromJson(rule?.condition);
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    enabled: rule?.enabled ?? true,
    stopProcessing: rule?.stop_processing ?? false,
    scopeAll: !rule?.mailbox_ids || rule.mailbox_ids.length === 0,
    mailboxIds: rule?.mailbox_ids ?? [],
    destinations: actions.notify?.destinations ?? [],
    mode: actions.notify?.mode ?? "instant",
    urgent: actions.notify?.urgent ?? false,
    editor: simple ? "simple" : "advanced",
    simple: simple ?? { ...EMPTY_SIMPLE },
    root: rootFromJson(rule?.condition),
  };
}

function conditionOf(s: EditorState) {
  return s.editor === "simple" ? simpleToJson(s.simple) : toJson(s.root);
}

function snapshot(s: EditorState) {
  return JSON.stringify([
    s.name,
    s.description,
    s.enabled,
    s.stopProcessing,
    s.scopeAll,
    s.mailboxIds,
    s.destinations,
    s.mode,
    s.urgent,
    conditionOf(s),
  ]);
}

function SimpleEditor({
  value,
  onChange,
  showIssues,
}: {
  value: SimpleRule;
  onChange: (v: SimpleRule) => void;
  showIssues: boolean;
}) {
  const problem = showIssues ? validateSimple(value) : null;
  return (
    <div className="space-y-5">
      <Field>
        <FieldLabel htmlFor="simple-senders">From these senders</FieldLabel>
        <TagInput
          id="simple-senders"
          ariaLabel="Senders"
          values={value.senders}
          onChange={(senders) => onChange({ ...value, senders })}
          normalize={normalizeSender}
          isValueInvalid={(v) => !isValidSender(v)}
          placeholder="univ.edu or someone@example.com"
          max={LIMITS.maxValues}
        />
        <FieldDescription>
          A whole organisation (like <span className="font-medium text-foreground">univ.edu</span>, which also covers
          exam.univ.edu) or one email address. Press Enter after each.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="simple-subject">The subject mentions any of</FieldLabel>
        <TagInput
          id="simple-subject"
          ariaLabel="Words in the subject"
          values={value.subjectWords}
          onChange={(subjectWords) => onChange({ ...value, subjectWords })}
          placeholder="admit card, interview, result"
          max={LIMITS.maxValues}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="simple-anywhere">Anywhere in the email mentions any of</FieldLabel>
        <TagInput
          id="simple-anywhere"
          ariaLabel="Words anywhere in the email"
          values={value.anyWords}
          onChange={(anyWords) => onChange({ ...value, anyWords })}
          placeholder="hall ticket, offer letter"
          max={LIMITS.maxValues}
        />
        <FieldDescription>Checks the subject and the text of the email. Capital letters don&apos;t matter.</FieldDescription>
      </Field>
      <p className="rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
        Fill in one box or more. If you fill in several, an email has to match <em>all</em> of them.
      </p>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [preview, setPreview] = useState<{ hit: RuleTestHit | null; mailbox: string | null }>({ hit: null, mailbox: null });

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const conditionJson = useMemo(() => conditionOf(state), [state]);
  const size = useMemo(() => measure(toJson(state.root)), [state.root]);
  const validation = useMemo(() => validateTree(state.root, fields.data ?? []), [state.root, fields.data]);
  const simpleProblem = state.editor === "simple" ? validateSimple(state.simple) : null;
  const advancedProblem =
    state.editor === "advanced" && (Object.keys(validation.issues).length > 0 || validation.global.length > 0);
  const dirty = snapshot(state) !== baseline;
  const saving = create.isPending || update.isPending;
  /** Can the current advanced tree be shown in simple mode? */
  const simpleFromTree = useMemo(
    () => (state.editor === "advanced" ? simpleFromJson(toJson(state.root)) : null),
    [state.editor, state.root],
  );

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

  function switchEditor(advanced: boolean) {
    setShowIssues(false);
    if (advanced) {
      setState((s) => ({
        ...s,
        editor: "advanced",
        root: simpleIsEmpty(s.simple) ? s.root : rootFromJson(simpleToJson(s.simple)),
      }));
    } else if (simpleFromTree) {
      setState((s) => ({ ...s, editor: "simple", simple: simpleFromTree }));
    }
  }

  /** Pre-fill the form from an AI suggestion; the user still reviews and saves. */
  function applyIdea(idea: RuleIdea) {
    const simple = simpleFromJson(idea.condition);
    setShowIssues(false);
    setNameError(null);
    setState((s) => ({
      ...s,
      name: idea.name.trim() ? idea.name.trim().slice(0, 120) : s.name,
      editor: simple ? "simple" : "advanced",
      simple: simple ?? s.simple,
      root: rootFromJson(idea.condition),
    }));
  }

  function buildConditionForTest() {
    if (simpleProblem || advancedProblem) {
      setShowIssues(true);
      return null;
    }
    return conditionJson;
  }

  async function save() {
    setApiError(null);
    const name = state.name.trim();
    const nErr = name ? null : "Give it a short name, like “University exams”.";
    const sErr = !state.scopeAll && state.mailboxIds.length === 0 ? "Choose at least one mailbox, or pick “All my mailboxes”." : null;
    setNameError(nErr);
    setScopeError(sErr);
    if (sErr) setMoreOpen(true);
    const conditionProblem = Boolean(simpleProblem || advancedProblem);
    if (conditionProblem) setShowIssues(true);
    if (nErr || sErr || conditionProblem) {
      toast.error("A few things need fixing before saving.");
      return;
    }
    const body = {
      name,
      description: state.description.trim() || null,
      enabled: state.enabled,
      stop_processing: state.stopProcessing,
      mailbox_ids: state.scopeAll ? null : state.mailboxIds,
      condition: conditionJson,
      actions: { notify: { destinations: state.destinations, mode: state.mode, urgent: state.urgent } },
    };
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, body });
        setBaseline(snapshot(state));
        toast.success("Saved");
      } else {
        const created = await create.mutateAsync(body);
        setBaseline(snapshot(state));
        toast.success("You're all set", { description: "We'll watch for this in new email from now on." });
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
      toast.error("Couldn't save");
    }
  }

  const verifiedDestinations = (destinations.data ?? []).filter((d) => d.verified_at);
  const unverified = (destinations.data ?? []).filter((d) => !d.verified_at);
  const summaryText = plainSummary(conditionJson);
  const hasCondition = state.editor === "advanced" || !simpleIsEmpty(state.simple);

  return (
    <div className="space-y-6">
      <PageHeader
        title={rule ? state.name.trim() || rule.name : "Watch for something new"}
        back={{ href: "/rules", label: "What to watch" }}
        description={rule ? undefined : "Tell us which emails matter. We'll send them to your WhatsApp."}
        className="pb-0"
        actions={
          <>
            {dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">Not saved yet</span> : null}
            {rule ? (
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            ) : null}
            <Button onClick={() => void save()} disabled={saving || (!!rule && !dirty)}>
              {saving ? <Spinner /> : <Save />}
              {rule ? "Save changes" : "Start watching"}
            </Button>
          </>
        }
      />

      {apiError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t save this</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{apiError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {rule ? null : <AiRuleBox onIdea={applyIdea} />}
          <Card>
            <CardContent>
              <Field data-invalid={Boolean(nameError) || undefined}>
                <FieldLabel htmlFor="rule-name">Name</FieldLabel>
                <Input
                  id="rule-name"
                  value={state.name}
                  maxLength={120}
                  placeholder="University exams"
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  aria-invalid={Boolean(nameError) || undefined}
                />
                <FieldDescription>Shown on each WhatsApp alert, so you know why it arrived.</FieldDescription>
                {nameError ? <FieldError>{nameError}</FieldError> : null}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What should we watch for?</CardTitle>
              <CardDescription className="text-pretty">
                {hasCondition ? (
                  <>
                    <span className="text-foreground/80">We&apos;ll alert you when an email is </span>
                    {summaryText}.
                  </>
                ) : (
                  "Choose senders, words, or both."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                <label htmlFor="rule-advanced" className="flex items-center gap-2 text-sm font-medium">
                  <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden /> Advanced builder
                </label>
                {state.editor === "advanced" && !simpleFromTree ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring">
                        <Switch id="rule-advanced" checked disabled aria-label="Advanced builder" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>This rule uses options the simple form can&apos;t show.</TooltipContent>
                  </Tooltip>
                ) : (
                  <Switch id="rule-advanced" checked={state.editor === "advanced"} onCheckedChange={switchEditor} />
                )}
              </div>

              {state.editor === "simple" ? (
                <SimpleEditor value={state.simple} onChange={(v) => set("simple", v)} showIssues={showIssues} />
              ) : fields.isPending ? (
                <Skeleton className="h-40 w-full rounded-xl" />
              ) : (
                <>
                  <BuilderContext.Provider value={builder}>
                    <ConditionGroup node={state.root} depth={1} isRoot />
                  </BuilderContext.Provider>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular">
                      {size.nodes}/{LIMITS.maxNodes} conditions · {size.depth}/{LIMITS.maxDepth} levels deep
                    </span>
                    <span>Capital letters don&apos;t matter unless you switch on Aa.</span>
                  </div>
                  {showIssues && validation.global.length ? (
                    <Alert variant="destructive">
                      <AlertDescription>{validation.global.join(" ")}</AlertDescription>
                    </Alert>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How should we tell you?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                orientation="horizontal"
                className={cn("rounded-xl border p-3 transition-colors", state.urgent && "border-destructive/40 bg-destructive/5")}
              >
                <FieldContent>
                  <FieldLabel htmlFor="rule-urgent" className="flex items-center gap-2">
                    <Siren className={cn("size-4", state.urgent ? "text-destructive" : "text-muted-foreground")} aria-hidden />
                    Urgent
                  </FieldLabel>
                  <FieldDescription>
                    Alert me straight away, even at night. For things you can&apos;t miss, like exam changes or bank
                    security alerts.
                  </FieldDescription>
                </FieldContent>
                <Switch id="rule-urgent" checked={state.urgent} onCheckedChange={(v) => set("urgent", v)} />
              </Field>
              {!state.urgent ? (
                <Field>
                  <FieldLabel>When</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={state.mode}
                    onValueChange={(v) => v && set("mode", v as "instant" | "digest")}
                    className="w-full sm:w-auto"
                  >
                    <ToggleGroupItem value="instant" className="flex-1 px-4">
                      Right away
                    </ToggleGroupItem>
                    <ToggleGroupItem value="digest" className="flex-1 px-4">
                      Once a day, in a summary
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {state.mode === "instant"
                      ? "Each email arrives on WhatsApp within seconds (except during your quiet hours)."
                      : "These emails are collected and sent together at your summary time (set in Settings)."}
                  </FieldDescription>
                </Field>
              ) : null}
            </CardContent>
          </Card>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-left text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring">
              <span>
                More options
                <span className="block text-xs font-normal text-muted-foreground">
                  Which mailboxes, who gets the alert, turn it off, notes
                </span>
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", moreOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <Card>
                <CardContent className="space-y-6">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="rule-enabled">On</FieldLabel>
                      <FieldDescription>Turn it off to pause it without deleting it.</FieldDescription>
                    </FieldContent>
                    <Switch id="rule-enabled" checked={state.enabled} onCheckedChange={(v) => set("enabled", v)} />
                  </Field>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Check these mailboxes</h3>
                    <RadioGroup
                      value={state.scopeAll ? "all" : "selected"}
                      onValueChange={(v) => {
                        set("scopeAll", v === "all");
                        setScopeError(null);
                      }}
                      className="gap-2"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="all" /> All my mailboxes, including ones I add later
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="selected" /> Only some of them
                      </label>
                    </RadioGroup>
                    {!state.scopeAll ? (
                      <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                        {(mailboxes.data ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No mailboxes added yet.</p>
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
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Send the alert to</h3>
                      <p className="text-sm text-muted-foreground">Tick nobody to use your usual WhatsApp.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {verifiedDestinations.map((d) => (
                        <label
                          key={d.id}
                          className={cn(
                            "flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-sm",
                            state.destinations.includes(d.id) && "border-brand bg-brand/10",
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
                          {d.is_default ? <Badge variant="secondary">Usual</Badge> : null}
                        </label>
                      ))}
                      {destinations.isPending ? <Skeleton className="h-12 w-full" /> : null}
                    </div>
                    {unverified.length ? (
                      <p className="text-xs text-muted-foreground">
                        {unverified.length} number{unverified.length > 1 ? "s aren't" : " isn't"} confirmed yet.{" "}
                        <Link href="/destinations" className="underline underline-offset-2">
                          Confirm on the WhatsApp page
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>

                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="rule-stop">Stop here</FieldLabel>
                      <FieldDescription>
                        When this catches an email, don&apos;t check the rules listed after it.
                      </FieldDescription>
                    </FieldContent>
                    <Switch id="rule-stop" checked={state.stopProcessing} onCheckedChange={(v) => set("stopProcessing", v)} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="rule-desc">Note for yourself</FieldLabel>
                    <Textarea
                      id="rule-desc"
                      rows={2}
                      maxLength={1000}
                      value={state.description}
                      placeholder="Optional"
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </Field>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-20">
          <TestPanel
            buildCondition={buildConditionForTest}
            onResult={(r, mailbox) => setPreview({ hit: r?.results.find((h) => h.matched) ?? null, mailbox })}
          />
          <WhatsAppPreview
            ruleName={state.name}
            hit={preview.hit}
            mailbox={preview.mailbox}
            mode={state.mode}
            urgent={state.urgent}
          />
        </aside>
      </div>

      {rule ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete “${rule.name}”?`}
          description="We'll stop watching for this straight away. Emails it already caught stay in Important mail."
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(rule.id, {
              onSuccess: () => {
                setBaseline(snapshot(state));
                toast.success("Deleted");
                router.replace("/rules");
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
