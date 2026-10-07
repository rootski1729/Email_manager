"use client";

import { ArrowRight, FileText, Image as ImageIcon, Paperclip } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundAttachment, OutboundEmail } from "@/lib/api/types";
import { humanSize } from "@/lib/compose";
import { OUTBOUND_STATUS } from "@/lib/status";

export function OutboundStatusBadge({ status }: { status: OutboundEmail["status"] }) {
  const s = OUTBOUND_STATUS[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <StatusBadge tone={s.tone} pulse={status === "sending" || status === "awaiting_confirmation"}>
            {s.label}
          </StatusBadge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{s.hint}</TooltipContent>
    </Tooltip>
  );
}

export function recipientsLine(e: Pick<OutboundEmail, "to_addresses" | "cc_addresses" | "bcc_addresses">) {
  const all = [...e.to_addresses, ...e.cc_addresses, ...e.bcc_addresses];
  if (all.length === 0) return "no recipients";
  return all.length === 1 ? all[0] : `${all[0]} +${all.length - 1}`;
}

export function FromTo({ email }: { email: OutboundEmail }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <span className="truncate">{email.from_address || "—"}</span>
      <ArrowRight className="size-3.5 shrink-0" aria-label="to" />
      <span className="truncate text-foreground/80">{recipientsLine(email)}</span>
    </span>
  );
}

export function AttachmentChip({ a }: { a: OutboundAttachment }) {
  const Icon = a.mime_type.startsWith("image/") ? ImageIcon : a.mime_type === "application/pdf" ? FileText : Paperclip;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
      <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{a.filename}</span>
      <span className="shrink-0 text-muted-foreground tabular">{humanSize(a.size)}</span>
    </span>
  );
}
