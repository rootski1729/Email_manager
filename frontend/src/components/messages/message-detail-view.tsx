"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MoreHorizontal, Reply, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmailAssistant, type AssistantTab } from "@/components/ai/email-assistant";
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
import { aiStatusQuery } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/errors";
import { destinationsQuery, messageContentQuery, messageQuery, useDeleteMessage } from "@/lib/api/queries";
import { initials } from "@/lib/format";
import { DetectedDates } from "./detected-dates";
import { FullEmail } from "./full-email";
import { MuteMenu } from "./mute-menu";
import { RemindMenu } from "./remind-menu";
import { WhatsAppDeliveries } from "./whatsapp-deliveries";

const BACK = { href: "/messages", label: "Important mail" };

export function MessageDetailView({ id }: { id: string }) {
  const router = useRouter();
  const message = useQuery(messageQuery(id));
  const content = useQuery({ ...messageContentQuery(id), enabled: message.isSuccess });
  const destinations = useQuery(destinationsQuery);
  const remove = useDeleteMessage();
  const [deleting, setDeleting] = useState(false);
  const aiStatus = useQuery(aiStatusQuery);
  const aiAvailable = aiStatus.data?.available ?? false;
  const [tab, setTab] = useState<AssistantTab>("ask");
  const [focusReply, setFocusReply] = useState(0);
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
  const to = content.data?.to ?? m.to_addresses;
  const cc = content.data?.cc ?? [];
  const recipients = [to.join(", "), cc.length ? `cc ${cc.join(", ")}` : ""].filter(Boolean).join(" · ");

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
        <Button
          onClick={() => {
            setTab("reply");
            setFocusReply((n) => n + 1);
          }}
        >
          <Reply /> Reply
        </Button>
        <RemindMenu messageId={m.id} />
        <MuteMenu messageId={m.id} fromAddress={m.from_address} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {m.web_url ? (
              <DropdownMenuItem asChild>
                <a href={m.web_url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Open in {provider}
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Remove from MailSentinel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/*
        Wide screens: the email (with its dates and alerts) on the left, the Assistant beside it.
        Narrower: one column, with the Assistant straight after the email (the left column is `contents`).
      */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
          <article className="order-1 min-w-0 rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
              >
                {initials(from)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0 truncate font-medium">{from}</div>
                  {content.data?.kind === "reply" ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Reply className="size-3.5" aria-hidden /> Reply in a thread
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-sm text-muted-foreground">{m.from_address}</div>
                {recipients ? (
                  <div className="truncate text-sm text-muted-foreground" title={recipients}>
                    to {recipients}
                  </div>
                ) : null}
              </div>
            </div>
            {m.ai_summary ? (
              <div className="mt-5 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
                <p className="text-xs font-semibold tracking-wider text-brand-ink uppercase">In short</p>
                <p className="mt-1 text-pretty">{m.ai_summary}</p>
                {m.ai_action ? (
                  <p className="mt-1.5">
                    <span className="font-medium">To do:</span> {m.ai_action}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-6">
              <FullEmail messageId={m.id} content={content} webUrl={content.data?.web_url ?? m.web_url} snippet={m.snippet} />
            </div>
          </article>

          <div className="order-3 min-w-0">
            <DetectedDates messageId={m.id} events={m.events ?? []} />
          </div>
          <div className="order-3 rounded-xl border bg-card p-4">
            <h2 className="text-base font-semibold tracking-tight">Why it&apos;s important</h2>
            <p className="text-sm text-muted-foreground">It matched {m.matches.length === 1 ? "this" : "these"}:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {m.matches.map((match) => (
                <li key={`${match.rule_id}-${match.matched_at}`}>
                  {match.rule_id ? (
                    <Link
                      href={`/rules/${match.rule_id}`}
                      className="inline-flex h-7 items-center rounded-md bg-secondary px-2.5 text-sm font-medium text-secondary-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {match.rule_name}
                    </Link>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-md bg-muted px-2.5 text-sm text-muted-foreground">
                      {match.rule_name} (removed)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="order-3 min-w-0">
            <WhatsAppDeliveries notifications={m.notifications} destinations={destMap} />
          </div>
        </div>

        {aiStatus.isPending ? (
          <Skeleton className="order-2 h-64 rounded-xl" />
        ) : (
          <EmailAssistant
            key={m.id}
            messageId={m.id}
            aiAvailable={aiAvailable}
            tab={tab}
            onTabChange={setTab}
            focusReply={focusReply}
            className="order-2 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6.5rem)]"
          />
        )}
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
