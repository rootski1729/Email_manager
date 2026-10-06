"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Inbox, Plus, RotateCw, ScanSearch, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { ruleSuggestionsQuery, useInstallPack, useRuleFromSender } from "@/lib/api/packs";
import { mailboxesQuery } from "@/lib/api/queries";
import type { PackSuggestion, SenderSuggestion } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { PackIcon } from "./pack-icon";

function Examples({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {items.slice(0, 2).map((ex, i) => (
        <li key={i} className="truncate text-xs text-muted-foreground/90 italic">
          “{ex}”
        </li>
      ))}
    </ul>
  );
}

function AddButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="shrink-0" disabled={pending} onClick={onClick} aria-label={label}>
      {pending ? <Spinner /> : <Plus />} Add
    </Button>
  );
}

function PackRow({ s }: { s: PackSuggestion }) {
  const install = useInstallPack();
  return (
    <li className="flex items-start gap-3 py-3">
      <PackIcon name={s.pack.icon} className="size-9" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{s.pack.name}</div>
        <p className="text-sm text-muted-foreground">
          Would have caught <span className="font-medium text-foreground tabular">{pluralize(s.count, "email")}</span>
          {s.examples.length ? ", e.g." : ""}
        </p>
        <Examples items={s.examples} />
      </div>
      <AddButton
        label={`Add ${s.pack.name}`}
        pending={install.isPending}
        onClick={() =>
          install.mutate(
            { id: s.pack.id },
            {
              onSuccess: (rule) => toast.success(`“${rule.name}” is on`),
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />
    </li>
  );
}

function SenderRow({ s }: { s: SenderSuggestion }) {
  const add = useRuleFromSender();
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <UserRound className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium break-all">{s.domain}</span>
          <span className="text-xs text-muted-foreground tabular">{pluralize(s.count, "email")}</span>
        </div>
        {s.names.length ? (
          <p className="truncate text-sm text-muted-foreground">{s.names.slice(0, 3).join(", ")}</p>
        ) : null}
        <Examples items={s.examples} />
      </div>
      <AddButton
        label={`Watch everything from ${s.domain}`}
        pending={add.isPending}
        onClick={() =>
          add.mutate(
            { domain: s.domain, urgent: false },
            {
              onSuccess: (rule) => toast.success(`“${rule.name}” is on`),
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Reading the headers of your recent mail. This takes a few seconds…
      </p>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

function Results({ mailboxId }: { mailboxId: string }) {
  const q = useQuery(ruleSuggestionsQuery(mailboxId));
  if (q.isPending) return <ResultsSkeleton />;
  if (q.isError) return <ErrorState error={q.error} title="Couldn't read recent mail" onRetry={() => void q.refetch()} />;
  const { packs, senders, scanned } = q.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Looked at {pluralize(scanned, "recent email")}.</span>
        <Button variant="ghost" size="icon-xs" aria-label="Scan again" onClick={() => void q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Spinner /> : <RotateCw />}
        </Button>
      </div>
      {packs.length === 0 && senders.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Check className="size-4 text-success" aria-hidden />
          Nothing new to suggest. You already watch for everything important in your recent email.
        </p>
      ) : null}
      {packs.length ? (
        <div>
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Topics</h3>
          <ul className="divide-y">
            {packs.map((s) => (
              <PackRow key={s.pack.id} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
      {senders.length ? (
        <div>
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">People who write to you</h3>
          <ul className="divide-y">
            {senders.map((s) => (
              <SenderRow key={s.domain} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** "Suggested for you": scan a mailbox's recent headers for packs and personal senders worth a rule. */
export function SuggestionsPanel() {
  const mailboxes = useQuery(mailboxesQuery);
  const [picked, setPicked] = useState<string | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const list = mailboxes.data ?? [];
  const mailboxId = picked ?? list.find((m) => m.status === "active")?.id ?? list[0]?.id ?? null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <ScanSearch className="size-4 text-brand-ink" /> Suggested for you
        </CardTitle>
        <CardDescription>
          We look at your recent email and suggest things worth watching. Only senders and subjects are read; nothing is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mailboxes.isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
            Add a mailbox to get suggestions.
            <Button asChild size="sm" variant="outline">
              <Link href="/mailboxes?add=1">
                <Inbox /> Add a mailbox
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={mailboxId ?? undefined}
              onValueChange={(v) => {
                setPicked(v);
                if (scanning) setScanning(v);
              }}
            >
              <SelectTrigger className="w-full min-w-0 sm:flex-1" aria-label="Mailbox to scan">
                <SelectValue placeholder="Choose a mailbox" />
              </SelectTrigger>
              <SelectContent>
                {list.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name || m.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scanning !== mailboxId ? (
              <Button onClick={() => setScanning(mailboxId)} disabled={!mailboxId}>
                <ScanSearch /> Find suggestions
              </Button>
            ) : null}
          </div>
        )}
        {scanning && scanning === mailboxId ? <Results key={scanning} mailboxId={scanning} /> : null}
      </CardContent>
    </Card>
  );
}
