"use client";

import { CalendarSearch, FileText } from "lucide-react";
import { useState } from "react";

import { ToneBadge } from "@/components/admin/common/tone-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SAMPLE_DATES } from "@/lib/admin/presets";
import { useTestDates } from "@/lib/admin/queries";
import type { ToolDateFound } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function formatWhen(f: ToolDateFound, zone: string): string {
  const d = new Date(f.starts_at);
  if (Number.isNaN(d.getTime())) return f.starts_at;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      ...(f.all_day ? {} : { timeStyle: "short" }),
      timeZone: zone,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2" title={`${pct}% sure`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-muted-foreground/50")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular">{pct}% sure</span>
    </div>
  );
}

export function DateFinder() {
  const find = useTestDates();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [zone, setZone] = useState(browserZone);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Paste an email</CardTitle>
            <CardDescription>See which exam, interview or deadline dates MailSentinel would pick up.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSubject(SAMPLE_DATES.subject);
              setBody(SAMPLE_DATES.body);
            }}
          >
            <FileText /> Sample text
          </Button>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              find.mutate({ subject, body, timezone: zone.trim() || "Asia/Kolkata" });
            }}
          >
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="df-subject">Subject</FieldLabel>
                <Input id="df-subject" value={subject} maxLength={500} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="df-body">Body</FieldLabel>
                <Textarea id="df-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="df-tz">Client&apos;s time zone</FieldLabel>
                <Input id="df-tz" value={zone} onChange={(e) => setZone(e.target.value)} spellCheck={false} />
                <FieldDescription>Decides how “3 PM” and “10/11” are read.</FieldDescription>
              </Field>
              <Button type="submit" disabled={find.isPending || (!subject.trim() && !body.trim())}>
                {find.isPending ? <Spinner /> : <CalendarSearch />} Find dates
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="min-w-0">
        {find.data === undefined ? (
          <EmptyState
            icon={CalendarSearch}
            title="Results appear here"
            description="Paste an email on the left, or use the sample text, then press Find dates."
          />
        ) : find.data.length === 0 ? (
          <EmptyState icon={CalendarSearch} title="No dates found" description="Nothing in this email looks like an exam, interview or deadline." />
        ) : (
          <ul className="space-y-3">
            {find.data.map((f, i) => {
              const confirmed = f.status.startsWith("upcoming");
              return (
                <li key={i} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge tone="brand" className="capitalize">
                      {f.kind.replace(/_/g, " ")}
                    </ToneBadge>
                    <ToneBadge tone={confirmed ? "success" : "warning"}>
                      {confirmed ? "Reminders on" : "Suggested only"}
                    </ToneBadge>
                  </div>
                  <p className="mt-2 font-medium">{f.title}</p>
                  <p className="text-sm">{formatWhen(f, zone.trim() || "Asia/Kolkata")}{f.all_day ? " (all day)" : ""}</p>
                  <div className="mt-2">
                    <Confidence value={f.confidence} />
                  </div>
                  {f.context ? (
                    <blockquote className="mt-3 border-l-2 pl-3 text-sm text-muted-foreground italic">{f.context}</blockquote>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
