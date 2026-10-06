"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Mail, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/errors";
import { phoneDisplay } from "@/lib/admin/labels";
import { CONDITION_PRESETS, SAMPLE_EMAIL } from "@/lib/admin/presets";
import { ruleQuery, rulesQuery, useTestRule } from "@/lib/admin/queries";
import { summarizeCondition } from "@/lib/admin/rule-summary";
import type { AdminRuleRow } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { RulePicker } from "./rule-picker";

function pretty(v: unknown) {
  return JSON.stringify(v, null, 2);
}

function parseJson(text: string): { value: Record<string, unknown> | null; error: string | null } {
  if (!text.trim()) return { value: null, error: "Enter a condition." };
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { value: null, error: "The condition must be a JSON object." };
    return { value: v as Record<string, unknown>, error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : "Not valid JSON." };
  }
}

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseHeaders(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** One explanation line from the API: leading 4-space indents, then ✓/✗ and text. */
function ExplanationLine({ line }: { line: string }) {
  const indent = Math.floor((line.length - line.trimStart().length) / 4);
  const text = line.trim();
  const ok = text.startsWith("✓");
  const bad = text.startsWith("✗");
  const body = ok || bad ? text.slice(1).trim() : text;
  return (
    <li className="flex items-start gap-2 py-1 text-sm" style={{ paddingLeft: `${indent * 1.25}rem` }}>
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Matched" />
      ) : bad ? (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Didn't match" />
      ) : null}
      <span className={cn(!ok && bad && "text-muted-foreground")}>{body}</span>
    </li>
  );
}

function TesterForm({ initialRule, rules, rulesLoading }: { initialRule: AdminRuleRow | null; rules: AdminRuleRow[]; rulesLoading: boolean }) {
  const test = useTestRule();
  const [loaded, setLoaded] = useState<AdminRuleRow | null>(initialRule);
  const [conditionText, setConditionText] = useState(pretty(initialRule?.condition ?? CONDITION_PRESETS[0].condition));
  const [email, setEmail] = useState(SAMPLE_EMAIL);
  const parsed = useMemo(() => parseJson(conditionText), [conditionText]);
  const summary = parsed.value ? summarizeCondition(parsed.value) : null;

  const setField = (k: keyof typeof SAMPLE_EMAIL, v: string) => setEmail((e) => ({ ...e, [k]: v }));

  const run = () => {
    if (!parsed.value) return;
    test.mutate({
      condition: parsed.value,
      from_address: email.from_address.trim(),
      from_name: email.from_name.trim(),
      to: splitList(email.to),
      subject: email.subject,
      body: email.body,
      headers: parseHeaders(email.headers),
      attachment_names: splitList(email.attachments),
    });
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>1. The condition</CardTitle>
          <CardDescription>Paste rule JSON, start from an example, or load a real client&apos;s rule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select
              value=""
              onValueChange={(id) => {
                const p = CONDITION_PRESETS.find((x) => x.id === id);
                if (p) {
                  setConditionText(pretty(p.condition));
                  setLoaded(null);
                  test.reset();
                }
              }}
            >
              <SelectTrigger size="sm" className="w-48" aria-label="Load an example">
                <SelectValue placeholder="Load an example…" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RulePicker
              rules={rules}
              loading={rulesLoading}
              onPick={(r) => {
                setConditionText(pretty(r.condition));
                setLoaded(r);
                test.reset();
              }}
            />
          </div>
          {loaded ? (
            <p className="text-xs text-muted-foreground">
              Loaded <span className="font-medium text-foreground">{loaded.name}</span> from{" "}
              {loaded.owner_name || phoneDisplay(loaded.owner_phone)}. Editing here never changes the real rule.
            </p>
          ) : null}
          <Field data-invalid={parsed.error ? true : undefined}>
            <FieldLabel htmlFor="rt-condition" className="sr-only">
              Condition JSON
            </FieldLabel>
            <Textarea
              id="rt-condition"
              rows={14}
              spellCheck={false}
              className="font-mono text-xs"
              value={conditionText}
              aria-invalid={parsed.error ? true : undefined}
              onChange={(e) => setConditionText(e.target.value)}
            />
            {parsed.error ? (
              <FieldError>{parsed.error}</FieldError>
            ) : (
              <FieldDescription>
                <span className="font-medium text-foreground">In plain words:</span> {summary}
              </FieldDescription>
            )}
          </Field>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>2. A pretend email</CardTitle>
              <CardDescription>Nothing is sent or saved.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEmail(SAMPLE_EMAIL)}>
              <Mail /> Sample
            </Button>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rt-from">From address</FieldLabel>
                  <Input id="rt-from" value={email.from_address} onChange={(e) => setField("from_address", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rt-from-name">From name</FieldLabel>
                  <Input id="rt-from-name" value={email.from_name} onChange={(e) => setField("from_name", e.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="rt-to">To (comma-separated)</FieldLabel>
                <Input id="rt-to" value={email.to} onChange={(e) => setField("to", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rt-subject">Subject</FieldLabel>
                <Input id="rt-subject" value={email.subject} onChange={(e) => setField("subject", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rt-body">Body</FieldLabel>
                <Textarea id="rt-body" rows={5} value={email.body} onChange={(e) => setField("body", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rt-headers">Extra headers</FieldLabel>
                  <Textarea
                    id="rt-headers"
                    rows={2}
                    className="font-mono text-xs"
                    placeholder={"List-Unsubscribe: <mailto:x>\nList-Id: news.example.com"}
                    value={email.headers}
                    onChange={(e) => setField("headers", e.target.value)}
                  />
                  <FieldDescription>One per line, as Name: value.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rt-att">Attachment names</FieldLabel>
                  <Input
                    id="rt-att"
                    placeholder="admit-card.pdf, notice.pdf"
                    value={email.attachments}
                    onChange={(e) => setField("attachments", e.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full" disabled={!parsed.value || test.isPending} onClick={run}>
          {test.isPending ? <Spinner /> : <FlaskConical />} Test the rule
        </Button>

        {test.isError ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Couldn&apos;t test this rule</AlertTitle>
            <AlertDescription>{errorMessage(test.error)}</AlertDescription>
          </Alert>
        ) : null}
        {test.data ? (
          <Card className={cn("border-2", test.data.matched ? "border-success/50" : "border-destructive/40")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {test.data.matched ? (
                  <>
                    <CheckCircle2 className="size-5 text-success" /> It matches — this email would be sent to WhatsApp
                  </>
                ) : (
                  <>
                    <XCircle className="size-5 text-destructive" /> No match — this email would be ignored
                  </>
                )}
              </CardTitle>
              <CardDescription>
                <Badge variant="outline">Why</Badge> each part of the condition, checked against the email:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                {test.data.explanation.map((line, i) => (
                  <ExplanationLine key={i} line={line} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function RuleTester({ ruleId }: { ruleId?: string }) {
  const rules = useQuery(rulesQuery({ q: "", clientId: null }));
  // Fetch the linked rule directly: the list only holds the newest rules.
  const linked = useQuery({ ...ruleQuery(ruleId ?? ""), enabled: Boolean(ruleId) });
  if (ruleId && linked.isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  const initial: AdminRuleRow | null = ruleId ? (linked.data ?? null) : null;
  return (
    <TesterForm
      key={initial?.id ?? "blank"}
      initialRule={initial}
      rules={rules.data ?? []}
      rulesLoading={rules.isPending}
    />
  );
}
