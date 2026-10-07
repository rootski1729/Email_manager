"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MoreHorizontal, Paperclip, SearchX, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ReplyWithAiPanel } from "@/components/ai/reply-with-ai";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RefBadge } from "@/components/common/ref-badge";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiAvailable } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/errors";
import { destinationsQuery, messageQuery, useDeleteMessage } from "@/lib/api/queries";
import { absoluteTime, initials } from "@/lib/format";
import { DetectedDates } from "./detected-dates";
import { MuteMenu } from "./mute-menu";
import { RemindMenu } from "./remind-menu";
import { WhatsAppDeliveries } from "./whatsapp-deliveries";

const BACK = { href: "/messages", label: "Important mail" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-2 text-sm sm:grid-cols-[7rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function MessageDetailView({ id }: { id: string }) {
  const router = useRouter();
  const message = useQuery(messageQuery(id));
  const destinations = useQuery(destinationsQuery);
  const remove = useDeleteMessage();
  const [deleting, setDeleting] = useState(false);
  const aiAvailable = useAiAvailable();
  const [replying, setReplying] = useState(false);
  const destMap = useMemo(() => new Map((destinations.data ?? []).map((d) => [d.id, d])), [destinations.data]);

  if (message.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }
  if (message.isError) {
    const status = message.error instanceof ApiError ? message.error.status : 0;
    return (
      <div className="space-y-4">
        <PageHeader title="Email" back={BACK} className="pb-2" />
        {status === 404 || status === 422 ? (
          <EmptyState icon={SearchX} title="Email not found" description="It may have been deleted, or it belongs to another account." />
        ) : (
          <ErrorState error={message.error} onRetry={() => void message.refetch()} />
        )}
      </div>
    );
  }

  const m = message.data;
  const from = m.from_name || m.from_address;
  const provider = m.web_url?.includes("mail.google.com") ? "Gmail" : "your mail";

  return (
    <div className="space-y-6">
      <PageHeader title={m.subject || "(no subject)"} back={BACK} className="pb-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{from}</span>
          <span aria-hidden>·</span>
          <RelativeTime iso={m.received_at} />
          <RefBadge value={m.ref} />
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {m.web_url ? (
          <Button asChild>
            <a href={m.web_url} target="_blank" rel="noreferrer noopener">
              Open in {provider} <ExternalLink />
            </a>
          </Button>
        ) : null}
        {aiAvailable ? (
          <Button variant="outline" onClick={() => setReplying((v) => !v)} aria-expanded={replying}>
            <Sparkles /> Reply with AI
          </Button>
        ) : null}
        <RemindMenu messageId={m.id} />
        <MuteMenu messageId={m.id} fromAddress={m.from_address} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Remove from MailSentinel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {aiAvailable && replying ? <ReplyWithAiPanel messageId={m.id} onClose={() => setReplying(false)} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <article className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {initials(from)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{from}</div>
                <div className="truncate text-sm text-muted-foreground">{m.from_address}</div>
              </div>
            </div>
            {m.ai_summary ? (
              <div className="mt-4 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">In short</p>
                <p className="mt-1 text-pretty">{m.ai_summary}</p>
                {m.ai_action ? (
                  <p className="mt-1.5">
                    <span className="font-medium">To do:</span> {m.ai_action}
                  </p>
                ) : null}
              </div>
            ) : null}
            {m.snippet ? (
              <blockquote className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-[0.95rem] leading-relaxed text-pretty">
                {m.snippet}
                {m.web_url ? (
                  <span className="mt-2 block text-sm text-muted-foreground">
                    This is a preview.{" "}
                    <a href={m.web_url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-ink underline-offset-2 hover:underline">
                      Read the full email in {provider}
                    </a>
                    .
                  </span>
                ) : null}
              </blockquote>
            ) : null}
            <details className="group mt-4 text-sm">
              <summary className="cursor-pointer rounded-md text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                More details
              </summary>
              <dl className="mt-2 divide-y">
                <Row label="To">{m.to_addresses.length ? m.to_addresses.join(", ") : "—"}</Row>
                <Row label="Received">{absoluteTime(m.received_at)}</Row>
                <Row label="Mailbox">{m.mailbox_address ?? "—"}</Row>
                {m.has_attachments ? (
                  <Row label="Attachments">
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" /> Yes
                    </span>
                  </Row>
                ) : null}
                {m.list_id ? (
                  <Row label="Mailing list">
                    <span className="font-mono text-xs">{m.list_id}</span>
                  </Row>
                ) : null}
              </dl>
            </details>
          </article>

          <WhatsAppDeliveries notifications={m.notifications} destinations={destMap} />
        </div>

        <div className="min-w-0 space-y-6">
          <DetectedDates messageId={m.id} events={m.events ?? []} />
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-base font-semibold tracking-tight">Why it&apos;s important</h2>
            <p className="text-sm text-muted-foreground">It matched {m.matches.length === 1 ? "this" : "these"}:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {m.matches.map((match) => (
                <li key={`${match.rule_id}-${match.matched_at}`}>
                  {match.rule_id ? (
                    <Link
                      href={`/rules/${match.rule_id}`}
                      className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-brand/30 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {match.rule_name}
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-sm text-muted-foreground">
                      {match.rule_name} (removed)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Remove this email from MailSentinel?"
        description="We'll forget the preview and details we saved. The real email in your mailbox stays exactly where it is."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(m.id, {
            onSuccess: () => {
              toast.success("Removed");
              router.replace("/messages");
            },
          })
        }
      />
    </div>
  );
}
