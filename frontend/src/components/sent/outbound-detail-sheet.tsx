"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, Clock, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { outboundEmailQuery, useCancelOutbound } from "@/lib/api/queries";
import { absoluteTime } from "@/lib/format";
import { AttachmentChip, OutboundStatusBadge } from "./outbound-parts";

const SOURCE_LABELS: Record<string, string> = { whatsapp: "WhatsApp", dashboard: "the website" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function OutboundDetailSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const email = useQuery({ ...outboundEmailQuery(id ?? ""), enabled: Boolean(id) });
  const cancel = useCancelOutbound();
  const [confirming, setConfirming] = useState(false);
  const e = email.data;

  return (
    <Sheet open={Boolean(id)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-base leading-snug break-words">
            {e ? e.subject || "(no subject)" : <Skeleton className="h-5 w-3/4" />}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {e ? (
                <>
                  <OutboundStatusBadge status={e.status} />
                  <span>
                    Created <RelativeTime iso={e.created_at} />
                  </span>
                </>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          {email.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : email.isError ? (
            <ErrorState error={email.error} onRetry={() => void email.refetch()} />
          ) : e ? (
            <>
              {e.status === "awaiting_confirmation" ? (
                <div className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
                  <MessageCircle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Reply <strong>YES</strong> to the preview on WhatsApp to send it
                    {e.confirm_expires_at ? (
                      <>
                        {" "}
                        — expires <RelativeTime iso={e.confirm_expires_at} />
                      </>
                    ) : null}
                    .
                  </p>
                </div>
              ) : null}
              {e.error ? (
                <p className="rounded-lg bg-destructive/8 px-3 py-2 font-mono text-xs break-words text-destructive">
                  {e.error}
                </p>
              ) : null}
              <dl className="divide-y">
                <Row label="From">{e.from_address || "—"}</Row>
                <Row label="To">{e.to_addresses.join(", ") || "—"}</Row>
                {e.cc_addresses.length ? <Row label="Cc">{e.cc_addresses.join(", ")}</Row> : null}
                {e.bcc_addresses.length ? <Row label="Bcc">{e.bcc_addresses.join(", ")}</Row> : null}
                {e.sent_at ? <Row label="Sent">{absoluteTime(e.sent_at)}</Row> : null}
                <Row label="Via">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>{SOURCE_LABELS[e.source] ?? e.source}</span>
                    {e.template_name ? <Badge variant="secondary" className="font-mono">/email {e.template_name}</Badge> : null}
                  </span>
                </Row>
              </dl>
              {(e.attachments ?? []).length ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {(e.attachments ?? []).length} attachment{(e.attachments ?? []).length > 1 ? "s" : ""}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(e.attachments ?? []).map((a) => (
                      <AttachmentChip key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Message</h3>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {e.body || <span className="text-muted-foreground">(empty body)</span>}
                </div>
              </div>
              {e.provider_message_id ? (
                <p className="text-xs text-muted-foreground">
                  Provider message ID: <span className="font-mono break-all">{e.provider_message_id}</span>
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        {e?.status === "awaiting_confirmation" ? (
          <SheetFooter className="border-t">
            <Button variant="destructive" onClick={() => setConfirming(true)} disabled={cancel.isPending}>
              <Ban /> Cancel this email
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Or reply NO on WhatsApp.
            </p>
          </SheetFooter>
        ) : null}
        {e ? (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Cancel this email?"
            description="It won't be sent, and replying YES on WhatsApp will no longer send it."
            confirmLabel="Cancel email"
            pending={cancel.isPending}
            onConfirm={() =>
              cancel.mutate(e.id, {
                onSuccess: () => {
                  toast.success("Email cancelled");
                  setConfirming(false);
                },
              })
            }
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
