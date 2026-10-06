"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MailCheck, Paperclip, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RefBadge } from "@/components/common/ref-badge";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { mailboxesQuery, messagesQuery, rulesQuery, type MessageFilters } from "@/lib/api/queries";
import type { Message } from "@/lib/api/types";
import { addDays, dayKey, formatDayKey } from "@/lib/datetime";
import { initials } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";

const ALL = "__all";

function MessageRow({ m }: { m: Message }) {
  const from = m.from_name || m.from_address;
  return (
    <li className="relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 has-[a:focus-visible]:bg-muted/50">
      <span
        aria-hidden
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
      >
        {initials(from)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{from}</span>
          <RelativeTime iso={m.received_at} className="relative z-10 shrink-0 text-xs text-muted-foreground" />
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/messages/${m.id}`}
            className="min-w-0 truncate text-[0.95rem] outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {m.subject || "(no subject)"}
          </Link>
          {m.has_attachments ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" /> : null}
        </div>
        {m.snippet ? <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{m.snippet}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <RefBadge value={m.ref} />
          {(m.rules ?? []).length ? (
            <span className="truncate">
              {m.rules[0]}
              {m.rules.length > 1 ? ` +${m.rules.length - 1}` : ""}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function dayLabel(key: string, today: string | null) {
  if (today && key === today) return "Today";
  if (today && key === addDays(today, -1)) return "Yesterday";
  return formatDayKey(key, { weekday: "long", day: "numeric", month: "long" });
}

export function MessagesView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const zone = useZone();
  const now = useNow();
  const mailboxId = params.get("mailbox") ?? "";
  const ruleId = params.get("rule") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const debouncedQ = useDebounced(q.trim(), 350);

  const filters: MessageFilters = {
    ...(mailboxId ? { mailbox_id: mailboxId } : {}),
    ...(ruleId ? { rule_id: ruleId } : {}),
    ...(debouncedQ ? { q: debouncedQ.slice(0, 200) } : {}),
  };
  const messages = useInfiniteQuery(messagesQuery(filters));
  const mailboxes = useQuery(mailboxesQuery);
  const rules = useQuery(rulesQuery);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const items = messages.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Boolean(mailboxId || ruleId || debouncedQ);
  const today = now ? dayKey(now, zone) : null;
  const groups: { key: string; items: Message[] }[] = [];
  for (const m of items) {
    const key = dayKey(m.received_at, zone);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(m);
    else groups.push({ key, items: [m] });
  }
  const showMailboxFilter = (mailboxes.data?.length ?? 0) > 1 || Boolean(mailboxId);
  const showRuleFilter = (rules.data?.length ?? 0) > 1 || Boolean(ruleId);

  return (
    <div>
      <PageHeader
        title="Important mail"
        description="Every email that matched what you watch for. Open one to set a reminder or mute the sender."
      />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <InputGroup className="h-10 sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by subject or sender"
            aria-label="Search important mail"
            maxLength={200}
          />
          {q ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQ("")}>
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {showMailboxFilter ? (
          <Select value={mailboxId || ALL} onValueChange={(v) => setParam("mailbox", v)}>
            <SelectTrigger className="h-10! w-full sm:w-48" aria-label="Show mail from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All mailboxes</SelectItem>
              {(mailboxes.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name || m.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {showRuleFilter ? (
          <Select value={ruleId || ALL} onValueChange={(v) => setParam("rule", v)}>
            <SelectTrigger className="h-10! w-full sm:w-48" aria-label="Show mail caught by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everything I watch</SelectItem>
              {(rules.data ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {messages.isPending ? (
        <ListSkeleton rows={6} />
      ) : messages.isError ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nothing found" description="Try other words, or show everything again.">
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Show everything
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={MailCheck}
            title="No important mail yet"
            description="When a new email matches what you watch for, it shows up here and on your WhatsApp."
          >
            <Button asChild>
              <Link href="/rules">Choose what to watch</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key, today)}>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {dayLabel(g.key, today)}
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {g.items.map((m) => (
                  <MessageRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex justify-center">
            {messages.hasNextPage ? (
              <Button variant="outline" onClick={() => void messages.fetchNextPage()} disabled={messages.isFetchingNextPage}>
                {messages.isFetchingNextPage ? <Spinner /> : null}
                Show older emails
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">That&apos;s everything.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
