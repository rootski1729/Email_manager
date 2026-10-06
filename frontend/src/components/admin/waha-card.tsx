"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut, Play, RotateCw, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { adminWahaQuery, useWahaAction, type WahaAction } from "@/lib/api/queries";
import { chatIdToDisplay } from "@/lib/format";
import { wahaStatus } from "@/lib/status";

const PAIRING = new Set(["SCAN_QR_CODE", "STARTING"]);

export function WahaCard() {
  const waha = useQuery({
    ...adminWahaQuery,
    refetchInterval: (q) => (PAIRING.has(q.state.data?.status ?? "") ? 3000 : 30_000),
  });
  const action = useWahaAction();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const status = waha.data?.status ?? "UNKNOWN";
  const s = wahaStatus(status);

  const run = (a: WahaAction, msg: string) =>
    action.mutate(a, {
      onSuccess: () => {
        toast.success(msg);
        setConfirmLogout(false);
      },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4 text-wa" /> WhatsApp session
        </CardTitle>
        <CardDescription>The linked phone that sends every alert and sign-in code.</CardDescription>
        <CardAction>
          {waha.data ? (
            <StatusBadge tone={s.tone} pulse={status === "WORKING" || PAIRING.has(status)}>
              {s.label}
            </StatusBadge>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {waha.isPending ? (
          <Skeleton className="h-32" />
        ) : waha.isError ? (
          <ErrorState error={waha.error} onRetry={() => void waha.refetch()} />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Engine status</dt>
                <dd className="font-mono text-xs">{status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paired number</dt>
                <dd className="truncate font-medium tabular">
                  {waha.data.me && status !== "UNREACHABLE" ? chatIdToDisplay(waha.data.me) : "Not paired"}
                </dd>
              </div>
              {waha.data.dry_run ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Mode</dt>
                  <dd>
                    <Badge variant="outline">Dry run — nothing is sent</Badge>
                  </dd>
                </div>
              ) : null}
            </dl>
            {status === "UNREACHABLE" && waha.data.detail ? (
              <p className="rounded-md bg-rose-500/8 px-3 py-2 font-mono text-xs text-rose-800 dark:text-rose-200">{waha.data.detail}</p>
            ) : null}
            {status === "SCAN_QR_CODE" ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-start">
                {waha.data.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URL from the API, refreshed every 3 s
                  <img
                    src={waha.data.qr}
                    alt="WhatsApp pairing QR code"
                    className="size-64 shrink-0 rounded-lg bg-white p-2 [image-rendering:pixelated]"
                  />
                ) : (
                  <Skeleton className="size-64 shrink-0" />
                )}
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  <li>Open WhatsApp on the phone that will send alerts.</li>
                  <li>
                    Go to <span className="font-medium text-foreground">Settings → Linked devices → Link a device</span>.
                  </li>
                  <li>Point the camera at this code. It refreshes automatically.</li>
                </ol>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-2 border-t">
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run("start", "Session starting")}>
          {action.isPending && action.variables === "start" ? <Spinner /> : <Play />} Start
        </Button>
        <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run("restart", "Session restarting")}>
          {action.isPending && action.variables === "restart" ? <Spinner /> : <RotateCw />} Restart
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" disabled={action.isPending} onClick={() => setConfirmLogout(true)}>
          <LogOut /> Log out phone
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Unlink the WhatsApp phone?"
        description="Alerts and sign-in codes stop until a phone is paired again by scanning a new QR code."
        confirmLabel="Log out"
        pending={action.isPending}
        onConfirm={() => run("logout", "WhatsApp phone unlinked")}
      />
    </Card>
  );
}
