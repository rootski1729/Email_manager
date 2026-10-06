"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Paperclip, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { RelativeTime } from "@/components/common/relative-time";
import { NotificationCard } from "@/components/deliveries/notification-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { destinationsQuery, messageQuery, useDeleteMessage } from "@/lib/api/queries";
import { absoluteTime } from "@/lib/format";

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
  const destMap = useMemo(() => new Map((destinations.data ?? []).map((d) => [d.id, d])), [destinations.data]);

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
      <Link href="/messages">
        <ArrowLeft /> Matched mail
      </Link>
    </Button>
  );

  if (message.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (message.isError) {
    const status = message.error instanceof ApiError ? message.error.status : 0;
    return (
      <div className="space-y-4">
        {back}
        {status === 404 || status === 422 ? (
          <EmptyState icon={SearchX} title="Email not found" description="It may have been deleted, or it belongs to another account." />
        ) : (
          <ErrorState error={message.error} onRetry={() => void message.refetch()} />
        )}
      </div>
    );
  }

  const m = message.data;
  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{m.subject || "(no subject)"}</h1>
          <div className="flex shrink-0 gap-2">
            {m.web_url ? (
              <Button asChild>
                <a href={m.web_url} target="_blank" rel="noreferrer noopener">
                  Open in {m.web_url.includes("mail.google.com") ? "Gmail" : "mail"} <ExternalLink />
                </a>
              </Button>
            ) : null}
            <Button variant="outline" size="icon" aria-label="Delete from history" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.matches.map((match) => (
            <Badge key={`${match.rule_id}-${match.matched_at}`} variant="secondary" className="bg-primary/10 text-primary" asChild={Boolean(match.rule_id)}>
              {match.rule_id ? <Link href={`/rules/${match.rule_id}`}>{match.rule_name}</Link> : <span>{match.rule_name}</span>}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="From">
                {m.from_name ? <span className="font-medium">{m.from_name} </span> : null}
                <span className="text-muted-foreground">&lt;{m.from_address}&gt;</span>
              </Row>
              <Row label="To">{m.to_addresses.length ? m.to_addresses.join(", ") : "—"}</Row>
              <Row label="Received">
                <RelativeTime iso={m.received_at} /> <span className="text-muted-foreground">· {absoluteTime(m.received_at)}</span>
              </Row>
              <Row label="Mailbox">{m.mailbox_address ?? "—"}</Row>
              {m.list_id ? (
                <Row label="List">
                  <span className="font-mono text-xs">{m.list_id}</span>
                </Row>
              ) : null}
              {m.has_attachments ? (
                <Row label="Attachments">
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="size-3.5" /> Yes
                  </span>
                </Row>
              ) : null}
            </dl>
            {m.snippet ? (
              <blockquote className="mt-4 rounded-lg border-l-4 border-primary/40 bg-muted/40 px-4 py-3 text-sm text-pretty text-muted-foreground">
                {m.snippet}
              </blockquote>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matched by</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-5">
              {m.matches.map((match) => (
                <li key={`${match.rule_id}-${match.matched_at}`} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="text-sm font-medium">{match.rule_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Matched <RelativeTime iso={match.matched_at} />
                    {match.rule_id ? null : " · rule since deleted"}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">WhatsApp deliveries</h2>
        {m.notifications.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No alerts were sent for this email — it may be waiting for your digest, or delivery was turned off.
          </p>
        ) : (
          <ul className="space-y-3">
            {m.notifications.map((n) => (
              <NotificationCard key={n.id} n={n} destinations={destMap} showMessageLink={false} />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this email from history?"
        description="Removes the stored snippet, headers and match record from MailSentinel. The original email in your mailbox is not touched."
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(m.id, {
            onSuccess: () => {
              toast.success("Removed from history");
              router.replace("/messages");
            },
          })
        }
      />
    </div>
  );
}
