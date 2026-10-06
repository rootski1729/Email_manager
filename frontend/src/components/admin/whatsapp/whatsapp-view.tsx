"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Play, PowerOff, QrCode, RotateCw, Smartphone, Square, Unplug, WifiOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ToneBadge } from "@/components/admin/common/tone-badge";
import { FailedMessages } from "@/components/admin/overview/failed-messages";
import { WhatsAppTestForm } from "@/components/admin/tools/whatsapp-test-form";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { wahaWords } from "@/lib/admin/labels";
import { useWahaAction, wahaQuery } from "@/lib/admin/queries";
import type { WahaAction, WahaSession } from "@/lib/admin/types";
import { chatIdToDisplay } from "@/lib/format";

const DONE: Record<WahaAction, string> = {
  start: "Starting WhatsApp…",
  restart: "Restarting WhatsApp…",
  stop: "WhatsApp stopped",
  logout: "Phone disconnected — scan a new QR code to reconnect",
};

function SpinningLoader({ className }: { className?: string }) {
  return <Loader2 className={`${className ?? ""} animate-spin`} />;
}

function Hero({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  const ring = {
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-foreground",
    danger: "bg-destructive/10 text-destructive",
    neutral: "bg-muted text-muted-foreground",
    info: "bg-info/10 text-info",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:items-start sm:text-left">
      <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${ring}`}>
        <Icon className="size-7" />
      </span>
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

function SessionBody({ s }: { s: WahaSession }) {
  const status = s.status.toUpperCase();
  if (status === "WORKING") {
    return (
      <Hero icon={CheckCircle2} tone="success" title={s.me ? `Connected as ${chatIdToDisplay(s.me)}` : "Connected"}>
        Alerts and sign-in codes are being sent from this phone. Keep it charged and online.
      </Hero>
    );
  }
  if (status === "SCAN_QR_CODE") {
    return (
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
        {s.qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL from the API, refreshed every 3 s
          <img
            src={s.qr}
            alt="WhatsApp pairing QR code"
            className="size-64 shrink-0 rounded-xl border bg-card p-2 [image-rendering:pixelated] sm:size-72"
          />
        ) : (
          <Skeleton className="size-64 shrink-0 rounded-xl sm:size-72" />
        )}
        <div className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <QrCode className="size-5 text-muted-foreground" /> Scan this QR code with WhatsApp
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the phone that should send every alert.</p>
          </div>
          <ol className="space-y-3 text-sm">
            {[
              "Open WhatsApp on that phone.",
              <>
                Tap <span className="font-medium">Settings</span> (iPhone) or <span className="font-medium">⋮ menu</span>{" "}
                (Android), then <span className="font-medium">Linked devices</span>.
              </>,
              <>
                Tap <span className="font-medium">Link a device</span> and point the camera at this code.
              </>,
              "Wait a few seconds — this page updates by itself.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">The code changes every few seconds; that&apos;s normal.</p>
        </div>
      </div>
    );
  }
  if (status === "STARTING") {
    return (
      <Hero icon={SpinningLoader} tone="info" title="Starting WhatsApp…">
        This usually takes a few seconds. A QR code will appear if the phone needs pairing.
      </Hero>
    );
  }
  if (status === "STOPPED") {
    return (
      <Hero icon={PowerOff} tone="neutral" title="WhatsApp is stopped">
        No alerts are being sent. Press <span className="font-medium text-foreground">Start</span> to turn it back on.
      </Hero>
    );
  }
  if (status === "UNREACHABLE") {
    return (
      <Hero icon={WifiOff} tone="danger" title="Can't reach the WhatsApp service">
        <p>The WAHA container may be down. Check that it&apos;s running, then refresh.</p>
        {s.detail ? <p className="mt-2 font-mono text-xs break-all">{s.detail}</p> : null}
      </Hero>
    );
  }
  return (
    <Hero icon={Unplug} tone="danger" title={status === "FAILED" ? "WhatsApp stopped working" : `Status: ${s.status}`}>
      Try <span className="font-medium text-foreground">Restart</span>. If it keeps failing, disconnect the phone and
      pair it again.
    </Hero>
  );
}

export function WhatsAppView() {
  const waha = useQuery({
    ...wahaQuery,
    refetchInterval: (q) => (q.state.data?.status === "WORKING" ? 30_000 : 3_000),
  });
  const action = useWahaAction();
  const [confirm, setConfirm] = useState<null | "logout" | "stop">(null);
  const status = waha.data?.status.toUpperCase() ?? "UNKNOWN";
  const words = wahaWords(status);

  const run = (a: WahaAction) =>
    action.mutate(a, {
      onSuccess: () => {
        toast.success(DONE[a]);
        setConfirm(null);
      },
    });
  const busy = (a: WahaAction) => action.isPending && action.variables === a;

  return (
    <div className="space-y-8">
      <PageHeader
        title="WhatsApp"
        description="One linked phone sends every alert, reminder and sign-in code for all clients."
        className="pb-0"
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4 text-muted-foreground" /> Sending phone
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {waha.data ? (
              <ToneBadge tone={words.tone} pulse={status !== "WORKING" && status !== "STOPPED"}>
                {words.label}
              </ToneBadge>
            ) : null}
            {waha.data?.dry_run ? <Badge variant="outline">Test mode — nothing is really sent</Badge> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {waha.isPending ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : waha.isError ? (
            <ErrorState error={waha.error} onRetry={() => void waha.refetch()} />
          ) : (
            <SessionBody s={waha.data} />
          )}
        </CardContent>
        {waha.data ? (
          <CardFooter className="flex-wrap gap-2 border-t">
            {status === "STOPPED" || status === "UNKNOWN" ? (
              <Button disabled={action.isPending} onClick={() => run("start")}>
                {busy("start") ? <Spinner /> : <Play />} Start
              </Button>
            ) : null}
            {status !== "STOPPED" ? (
              <Button
                variant={status === "FAILED" ? "default" : "outline"}
                disabled={action.isPending}
                onClick={() => run("restart")}
              >
                {busy("restart") ? <Spinner /> : <RotateCw />} Restart
              </Button>
            ) : null}
            {status === "WORKING" || status === "SCAN_QR_CODE" || status === "STARTING" ? (
              <Button variant="outline" disabled={action.isPending} onClick={() => setConfirm("stop")}>
                <Square /> Stop
              </Button>
            ) : null}
            {status === "WORKING" ? (
              <Button
                variant="ghost"
                className="text-destructive sm:ml-auto"
                disabled={action.isPending}
                onClick={() => setConfirm("logout")}
              >
                <Unplug /> Disconnect phone
              </Button>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Send a test message</CardTitle>
            <CardDescription>Sends immediately, skipping the queue, so you know the phone works.</CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsAppTestForm />
          </CardContent>
        </Card>
        <section className="min-w-0 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Failed WhatsApp messages</h2>
            <p className="text-sm text-muted-foreground">Once the phone is connected, retry anything that didn&apos;t go out.</p>
          </div>
          <FailedMessages limit={20} />
        </section>
      </div>

      <ConfirmDialog
        open={confirm === "logout"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Disconnect the phone?"
        description="Alerts and sign-in codes stop for every client until a phone is paired again by scanning a new QR code."
        confirmLabel="Disconnect phone"
        pending={busy("logout")}
        onConfirm={() => run("logout")}
      />
      <ConfirmDialog
        open={confirm === "stop"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Stop WhatsApp?"
        description="Nothing is sent until you start it again. The phone stays paired."
        confirmLabel="Stop"
        pending={busy("stop")}
        onConfirm={() => run("stop")}
      />
    </div>
  );
}
