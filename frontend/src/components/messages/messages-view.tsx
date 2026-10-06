"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ExternalLink, MailCheck, Paperclip, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { mailboxesQuery, messagesQuery, rulesQuery, type MessageFilters } from "@/lib/api/queries";
import type { Message } from "@/lib/api/types";
import { useDebounced } from "@/lib/hooks/use-debounced";

const ALL = "__all";

function MessageRow({ m }: { m: Message }) {
  return (
    <li className="group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/messages/${m.id}`}
            className="min-w-0 truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {m.subject || "(no subject)"}
          </Link>
          <RelativeTime iso={m.received_at} className="relative z-10 shrink-0 text-xs text-muted-foreground" />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">
            {m.from_name ? (
              <>
                <span className="text-foreground/80">{m.from_name}</span> · {m.from_address}
              </>
            ) : (
              m.from_address
            )}
          </span>
          {m.has_attachments ? <Paperclip className="size-3.5 shrink-0" aria-label="Has attachments" /> : null}
        </div>
        {m.snippet ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground/80">{m.snippet}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(m.rules ?? []).map((r) => (
            <Badge key={r} variant="secondary" className="bg-primary/10 text-primary">
              {r}
            </Badge>
          ))}
          {m.mailbox_address ? <span className="text-xs text-muted-foreground">in {m.mailbox_address}</span> : null}
          {m.web_url ? (
            <a
              href={m.web_url}
              target="_blank"
              rel="noreferrer noopener"
              className="relative z-10 ml-auto inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open in mail <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function MessagesView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  return (
    <div>
      <PageHeader title="Matched mail" description="Every email that matched at least one of your rules. Bodies of other mail are never stored." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject or sender"
            aria-label="Search matched mail"
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
        <Select value={mailboxId || ALL} onValueChange={(v) => setParam("mailbox", v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by mailbox">
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
        <Select value={ruleId || ALL} onValueChange={(v) => setParam("rule", v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by rule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All rules</SelectItem>
            {(rules.data ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {messages.isPending ? (
        <ListSkeleton rows={6} />
      ) : messages.isError ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="No matching emails" description="Try a different search or clear the filters.">
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={MailCheck}
            title="Nothing matched yet"
            description="When a new email matches one of your rules it will show up here, and on WhatsApp."
          >
            <Button asChild variant="outline">
              <Link href="/rules">Review rules</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {items.map((m) => (
              <MessageRow key={m.id} m={m} />
            ))}
          </ul>
          <div className="mt-4 flex justify-center">
            {messages.hasNextPage ? (
              <Button variant="outline" onClick={() => void messages.fetchNextPage()} disabled={messages.isFetchingNextPage}>
                {messages.isFetchingNextPage ? <Spinner /> : null}
                Load more
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">That&apos;s everything.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
