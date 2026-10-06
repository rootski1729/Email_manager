"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Send, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { SendEmailHeader } from "@/components/templates/send-email-header";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { outboundQuery } from "@/lib/api/queries";
import { OUTBOUND_STATUSES, type OutboundEmail, type OutboundStatus } from "@/lib/api/types";
import { OUTBOUND_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { OutboundDetailSheet } from "./outbound-detail-sheet";
import { AttachmentChip, FromTo, OutboundStatusBadge } from "./outbound-parts";

const ALL = "all";
const SIMPLE: { value: string; label: string }[] = [
  { value: ALL, label: "Everything" },
  { value: "awaiting_confirmation", label: "Waiting for YES" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

function Row({ e, href }: { e: OutboundEmail; href: string }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className={cn(
          "flex w-full flex-col gap-2 rounded-2xl border bg-card p-4 text-left transition-shadow outline-none hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50",
          e.status === "awaiting_confirmation" && "border-warning/40",
          e.status === "failed" && "border-destructive/40",
        )}
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          <OutboundStatusBadge status={e.status} />
          {e.template_name ? (
            <Badge variant="secondary" className="font-mono">
              {e.template_name}
            </Badge>
          ) : null}
          <RelativeTime iso={e.sent_at ?? e.created_at} className="ml-auto text-xs text-muted-foreground" />
        </div>
        <div className="min-w-0 w-full">
          <div className="truncate font-medium">{e.subject || "(no subject)"}</div>
          <FromTo email={e} />
        </div>
        {(e.attachments ?? []).length ? (
          <div className="flex flex-wrap gap-1.5">
            {(e.attachments ?? []).slice(0, 4).map((a) => (
              <AttachmentChip key={a.id} a={a} />
            ))}
            {(e.attachments ?? []).length > 4 ? (
              <span className="text-xs text-muted-foreground">+{(e.attachments ?? []).length - 4} more</span>
            ) : null}
          </div>
        ) : null}
        {e.error ? (
          <p className="line-clamp-2 w-full rounded-md bg-destructive/8 px-2 py-1.5 font-mono text-xs break-words text-destructive">
            {e.error}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export function SentView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("status");
  const status = raw && (OUTBOUND_STATUSES as string[]).includes(raw) ? (raw as OutboundStatus) : undefined;
  const openId = params.get("email");
  const isSimple = !status || SIMPLE.some((f) => f.value === status);
  const list = useInfiniteQuery(outboundQuery(status));
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  function hrefWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function setParams(patch: Record<string, string | null>) {
    router.replace(hrefWith(patch), { scroll: false });
  }

  return (
    <div className="space-y-5">
      <SendEmailHeader active="sent" />
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={isSimple ? (status ?? ALL) : ""}
          onValueChange={(v) => v && setParams({ status: v === ALL ? null : v })}
          aria-label="Show"
          className="flex-wrap"
        >
          {SIMPLE.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="px-3 sm:px-4">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!isSimple && status ? (
          <Button variant="secondary" size="sm" onClick={() => setParams({ status: null })}>
            Showing: {OUTBOUND_STATUS[status].label} <X />
          </Button>
        ) : null}
      </div>

      {list.isPending ? (
        <ListSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        status ? (
          <EmptyState icon={Send} title={`No ${OUTBOUND_STATUS[status].label.toLowerCase()} emails`} description={OUTBOUND_STATUS[status].hint} />
        ) : (
          <EmptyState
            icon={Send}
            title="Nothing sent yet"
            description={
              <>
                Send <code className="font-mono">/email</code> to the MailSentinel chat on WhatsApp, fill in the form and reply
                YES. Everything you send shows up here.
              </>
            }
          >
            <Button asChild variant="outline">
              <Link href="/templates">Set up a template</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((e) => (
              <Row key={e.id} e={e} href={hrefWith({ email: e.id })} />
            ))}
          </ul>
          <div className="mt-4 flex justify-center">
            {list.hasNextPage ? (
              <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? <Spinner /> : null}
                Load more
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">That&apos;s everything.</p>
            )}
          </div>
        </>
      )}
      <OutboundDetailSheet id={openId} onOpenChange={(o) => !o && setParams({ email: null })} />
    </div>
  );
}
