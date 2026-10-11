"use client";

import { Paperclip, Reply } from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { SenderAvatar } from "@/components/common/sender-avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AssistantResult } from "@/lib/api/assistant";
import { cn } from "@/lib/utils";

/**
 * One numbered match: number, sender, date, subject, a line or two of the email, and its mailbox.
 * The whole card opens the email; Reply asks the assistant for a reply to it.
 */
function ResultCard({
  result,
  opening,
  busy,
  onOpen,
  onReply,
}: {
  result: AssistantResult;
  opening: boolean;
  busy: boolean;
  onOpen: () => void;
  onReply: () => void;
}) {
  const from = result.from_name || result.from_address || "Unknown sender";
  const subject = result.subject || "(no subject)";
  return (
    <li
      className={cn(
        "lift group/card relative flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-3.5 text-card-foreground shadow-xs ring-1 ring-border",
        "has-[[data-open]:focus-visible]:ring-3 has-[[data-open]:focus-visible]:ring-ring/50",
        opening && "opacity-80",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-accent px-1 text-[11px] font-semibold text-brand-ink tabular"
        >
          <span className="sr-only">Result </span>
          {result.n}
        </span>
        <SenderAvatar name={from} className="size-7 text-[10px]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={result.from_address || undefined}>
          {from}
        </span>
        {result.has_attachments ? (
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />
        ) : null}
        <RelativeTime iso={result.date || null} fallback="" className="relative z-10 shrink-0 text-xs text-muted-foreground" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <button
          type="button"
          data-open
          onClick={onOpen}
          disabled={busy}
          aria-label={`Open “${subject}” from ${from}`}
          // Stretched over the whole card, so a click anywhere (but the buttons) opens it.
          className="block w-full truncate text-left text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl group-hover/card:text-accent-foreground disabled:cursor-default"
        >
          {subject}
        </button>
        {result.snippet ? (
          <p className="line-clamp-2 text-sm text-muted-foreground text-pretty break-words">{result.snippet}</p>
        ) : null}
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-2 pt-0.5">
        {result.mailbox ? (
          <span className="min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={result.mailbox}>
            {result.mailbox}
          </span>
        ) : null}
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onReply}
            disabled={busy}
            aria-label={`Reply to result ${result.n}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Reply aria-hidden /> Reply
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={onOpen}
            disabled={busy}
            aria-label={`Open result ${result.n}`}
          >
            {opening ? <Spinner className="size-3" aria-hidden /> : null} Open
          </Button>
        </div>
      </div>
    </li>
  );
}

/** A turn's matches: stacked on phones, two columns on wide screens when there's more than one. */
export function ResultList({
  results,
  openingN,
  busy,
  onOpen,
  onReply,
}: {
  results: AssistantResult[];
  /** The result being opened, if any. */
  openingN: number | null;
  busy: boolean;
  onOpen: (n: number) => void;
  onReply: (n: number) => void;
}) {
  if (!results.length) return null;
  return (
    <ul aria-label="Matching emails" className={cn("stagger grid gap-2.5", results.length > 1 && "lg:grid-cols-2")}>
      {results.map((r) => (
        <ResultCard
          key={r.n}
          result={r}
          opening={openingN === r.n}
          busy={busy}
          onOpen={() => onOpen(r.n)}
          onReply={() => onReply(r.n)}
        />
      ))}
    </ul>
  );
}
