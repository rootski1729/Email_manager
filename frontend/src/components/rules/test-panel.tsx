"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, FlaskConical, Play } from "lucide-react";
import { useState } from "react";

import { RelativeTime } from "@/components/common/relative-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/errors";
import { mailboxesQuery, useTestRule } from "@/lib/api/queries";
import type { RuleTestHit, RuleTestOut, SampleEmail } from "@/lib/api/types";
import type { ConditionJson } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

function splitList(s: string) {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseHeaders(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function HitRow({ hit }: { hit: RuleTestHit }) {
  return (
    <li className="flex gap-2.5 py-2.5">
      {hit.matched ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Matched" />
      ) : (
        <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="Not matched" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", hit.matched ? "font-medium" : "text-muted-foreground")}>
          {hit.subject || "(no subject)"}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{hit.from_name || hit.from_address}</span>
          {hit.received_at ? <RelativeTime iso={hit.received_at} className="shrink-0" /> : null}
        </div>
      </div>
    </li>
  );
}

export function TestPanel({
  buildCondition,
  onResult,
}: {
  /** Returns the condition JSON, or null when the builder has validation errors. */
  buildCondition: () => ConditionJson | null;
  onResult: (result: RuleTestOut | null, mailboxAddress: string | null) => void;
}) {
  const mailboxes = useQuery(mailboxesQuery);
  const test = useTestRule();
  const [mailboxId, setMailboxId] = useState<string>("");
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sample, setSample] = useState({
    from_address: "",
    from_name: "",
    to: "",
    subject: "",
    body: "",
    headers: "",
    attachments: "",
  });

  const effectiveMailbox = mailboxId || mailboxes.data?.[0]?.id || "";
  const mailboxAddress = mailboxes.data?.find((m) => m.id === effectiveMailbox)?.address ?? null;

  function run(kind: "mailbox" | "sample") {
    const condition = buildCondition();
    if (!condition) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    const body: Parameters<typeof test.mutate>[0] =
      kind === "mailbox"
        ? { condition, mailbox_id: effectiveMailbox, limit: 25 }
        : {
            condition,
            sample: {
              from_address: sample.from_address.trim(),
              from_name: sample.from_name.trim(),
              to: splitList(sample.to),
              subject: sample.subject,
              body: sample.body,
              headers: parseHeaders(sample.headers),
              attachment_names: splitList(sample.attachments),
            } satisfies SampleEmail,
          };
    test.mutate(body, {
      onSuccess: (r) => onResult(r, kind === "mailbox" ? mailboxAddress : null),
    });
  }

  const result = test.data;
  const hits = (result?.results ?? []).filter((h) => !onlyMatches || h.matched);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" /> Test rule
        </CardTitle>
        <CardDescription>Try the current conditions before saving. Nothing is sent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="mailbox" onValueChange={() => test.reset()}>
          <TabsList className="w-full">
            <TabsTrigger value="mailbox">Recent mail</TabsTrigger>
            <TabsTrigger value="sample">Sample email</TabsTrigger>
          </TabsList>
          <TabsContent value="mailbox" className="space-y-3 pt-2">
            {mailboxes.data && mailboxes.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Connect a mailbox to test against real mail, or use a sample email.</p>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="test-mailbox">Mailbox</FieldLabel>
                  <Select value={effectiveMailbox} onValueChange={setMailboxId}>
                    <SelectTrigger id="test-mailbox" className="w-full">
                      <SelectValue placeholder="Choose a mailbox" />
                    </SelectTrigger>
                    <SelectContent>
                      {(mailboxes.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.display_name || m.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="button" className="w-full" onClick={() => run("mailbox")} disabled={!effectiveMailbox || test.isPending}>
                  {test.isPending ? <Spinner /> : <Play />} Run against recent mail
                </Button>
              </>
            )}
          </TabsContent>
          <TabsContent value="sample" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="From address" placeholder="From address" value={sample.from_address} onChange={(e) => setSample({ ...sample, from_address: e.target.value })} />
              <Input aria-label="From name" placeholder="From name" value={sample.from_name} onChange={(e) => setSample({ ...sample, from_name: e.target.value })} />
            </div>
            <Input aria-label="To" placeholder="To (comma separated)" value={sample.to} onChange={(e) => setSample({ ...sample, to: e.target.value })} />
            <Input aria-label="Subject" placeholder="Subject" value={sample.subject} onChange={(e) => setSample({ ...sample, subject: e.target.value })} />
            <Textarea aria-label="Body" placeholder="Body text" rows={3} value={sample.body} onChange={(e) => setSample({ ...sample, body: e.target.value })} />
            <Textarea
              aria-label="Headers"
              placeholder={"Headers, one per line\nX-Priority: 1"}
              rows={2}
              className="font-mono text-xs"
              value={sample.headers}
              onChange={(e) => setSample({ ...sample, headers: e.target.value })}
            />
            <Input aria-label="Attachment names" placeholder="Attachment names (comma separated)" value={sample.attachments} onChange={(e) => setSample({ ...sample, attachments: e.target.value })} />
            <Button type="button" className="w-full" onClick={() => run("sample")} disabled={test.isPending}>
              {test.isPending ? <Spinner /> : <Play />} Test sample
            </Button>
          </TabsContent>
        </Tabs>

        {blocked ? (
          <Alert variant="destructive">
            <AlertDescription>Fix the highlighted conditions first.</AlertDescription>
          </Alert>
        ) : null}
        {test.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(test.error)}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-sm">
                <span className="font-semibold tabular">{result.matched}</span>
                <span className="text-muted-foreground"> of {result.tested} matched</span>
              </p>
              {result.tested > 1 ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch size="sm" checked={onlyMatches} onCheckedChange={setOnlyMatches} /> Only matches
                </label>
              ) : null}
            </div>
            {hits.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {result.tested === 0 ? "No recent mail found in this mailbox." : "No matches in this sample."}
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto px-3">
                {hits.map((h, i) => (
                  <HitRow key={`${h.subject}-${i}`} hit={h} />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
