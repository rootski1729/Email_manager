"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Mailbox, WahaHealth } from "@/lib/api/types";
import { MAILBOX_STATUS, wahaStatus } from "@/lib/status";
import { ProviderIcon } from "@/components/common/provider-icon";
import { RelativeTime } from "@/components/common/relative-time";

export function HealthCard({ waha, mailboxes }: { waha: WahaHealth; mailboxes: Mailbox[] }) {
  const w = wahaStatus(waha?.status);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>System health</CardTitle>
        <CardDescription>WhatsApp delivery and every connected mailbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-3 rounded-lg px-1 py-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-wa/12 text-wa">
            <MessageCircle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">WhatsApp sender</div>
            <div className="text-xs text-muted-foreground">
              {w.tone === "success" ? "Alerts are flowing normally." : "Alerts queue until the session is back."}
            </div>
          </div>
          <StatusBadge tone={w.tone} pulse={w.tone === "success"}>
            {w.label}
          </StatusBadge>
        </div>
        {mailboxes.map((m) => {
          const s = MAILBOX_STATUS[m.status];
          return (
            <Link
              key={m.id}
              href="/mailboxes"
              className="flex items-center gap-3 rounded-lg px-1 py-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ProviderIcon provider={m.provider} className="size-8 rounded-lg [&_svg]:size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.display_name || m.address}</div>
                <div className="text-xs text-muted-foreground">
                  Synced <RelativeTime iso={m.last_synced_at} fallback="never" />
                </div>
              </div>
              <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
