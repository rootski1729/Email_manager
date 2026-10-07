"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  ListFilter,
  LogOut,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Power,
  Send,
  Smartphone,
  Trash2,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MailboxTable } from "@/components/admin/common/mailbox-table";
import { NotificationList } from "@/components/admin/common/notification-list";
import { RuleTable } from "@/components/admin/common/rule-table";
import { ToneBadge } from "@/components/admin/common/tone-badge";
import { TypedConfirmDialog } from "@/components/admin/common/typed-confirm-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/errors";
import { NOTIFICATION_STATUS, planLabel } from "@/lib/admin/labels";
import { clientQuery, useDeleteClient, useSignOutClient, useUpdateClient } from "@/lib/admin/queries";
import type { ClientDetail, NotificationStatus } from "@/lib/admin/types";
import { absoluteTime, chatIdToDisplay, formatNumber, initials } from "@/lib/format";
import { EditClientDialog } from "./edit-client-dialog";
import { MessageClientDialog } from "./message-client-dialog";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular">{formatNumber(value)}</p>
    </div>
  );
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function onOff(v: unknown) {
  return v ? "On" : "Off";
}

/** Plain-language lines for the client's settings JSON. */
function settingsLines(settings: Record<string, unknown>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if ("quiet_hours" in settings) {
    const q = asRecord(settings.quiet_hours);
    lines.push({ label: "Quiet hours", value: q.enabled ? `${String(q.start)} – ${String(q.end)}` : "Off" });
  }
  if ("digest" in settings) {
    const d = asRecord(settings.digest);
    lines.push({ label: "Daily digest", value: d.enabled ? `At ${String(d.time)}` : "Off" });
  }
  if ("daily_cap" in settings) {
    lines.push({ label: "Daily alert limit", value: settings.daily_cap == null ? "No limit" : String(settings.daily_cap) });
  }
  if ("compose_enabled" in settings) lines.push({ label: "Email from WhatsApp", value: onOff(settings.compose_enabled) });
  if ("weekly_recap" in settings) lines.push({ label: "Weekly recap", value: onOff(settings.weekly_recap) });
  if ("deadlines_enabled" in settings) lines.push({ label: "Date reminders", value: onOff(settings.deadlines_enabled) });
  if ("muted_senders" in settings) {
    const m = Array.isArray(settings.muted_senders) ? settings.muted_senders.map(String) : [];
    lines.push({ label: "Muted senders", value: m.length ? m.join(", ") : "None" });
  }
  return lines;
}

function OverviewTab({ d }: { d: ClientDetail }) {
  const c = d.client;
  const lines = settingsLines(d.settings);
  const counts = Object.entries(d.notification_counts).filter(([, n]) => n > 0);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Info label="WhatsApp number">{c.phone_e164}</Info>
            <Info label="Email">{c.email || <span className="text-muted-foreground">Not set</span>}</Info>
            <Info label="Time zone">{c.timezone}</Info>
            <Info label="Plan">{planLabel(c.plan)}</Info>
            <Info label="Joined">{absoluteTime(c.created_at)}</Info>
            <Info label="Last sign-in">
              <RelativeTime iso={c.last_login_at} />
            </Info>
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Count label="Mailboxes" value={c.mailboxes} />
            <Count label="Rules" value={c.rules} />
            <Count label="Matched (7 d)" value={c.matched_7d} />
            <Count label="Emails sent" value={d.emails_sent} />
            <Count label="Upcoming dates" value={d.upcoming_events} />
            <Count label="Mailbox problems" value={c.problems} />
          </div>
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">This client hasn&apos;t saved any settings yet.</p>
            ) : (
              <dl className="divide-y">
                {lines.map((l) => (
                  <div key={l.label} className="flex items-start justify-between gap-4 py-2 text-sm">
                    <dt className="text-muted-foreground">{l.label}</dt>
                    <dd className="min-w-0 text-right font-medium break-words">{l.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp messages, all time</CardTitle>
          </CardHeader>
          <CardContent>
            {counts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No WhatsApp messages yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {counts.map(([s, n]) => {
                  const meta = NOTIFICATION_STATUS[s as NotificationStatus];
                  return (
                    <ToneBadge key={s} tone={meta?.tone ?? "neutral"}>
                      {meta?.label ?? s}: {formatNumber(n)}
                    </ToneBadge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmailsTab({ d }: { d: ClientDetail }) {
  if (d.recent_messages.length === 0) {
    return (
      <EmptyState icon={Mail} title="No important emails yet" description="Emails that match this client's rules show up here." />
    );
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {d.recent_messages.map((m) => (
        <li key={m.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{m.subject || "(no subject)"}</p>
            <p className="truncate text-xs text-muted-foreground">From {m.from_address}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {m.ref ? (
              <Badge variant="outline" className="font-mono">
                {m.ref}
              </Badge>
            ) : null}
            <RelativeTime iso={m.received_at} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DestinationsTab({ d }: { d: ClientDetail }) {
  if (d.destinations.length === 0) {
    return (
      <EmptyState
        icon={Smartphone}
        title="No WhatsApp destinations"
        description="Without one, this client can't receive alerts."
      />
    );
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {d.destinations.map((raw, i) => {
        const dest = asRecord(raw);
        const chat = typeof dest.chat_id === "string" ? dest.chat_id : "";
        const kind = String(dest.kind ?? "");
        return (
          <li key={String(dest.id ?? i)} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{String(dest.label || "WhatsApp")}</p>
              <p className="truncate text-xs text-muted-foreground">
                {chat ? chatIdToDisplay(chat) : "—"} · {kind.replace(/_/g, " ")}
              </p>
            </div>
            <div className="flex gap-1.5">
              {dest.is_default ? <Badge variant="secondary">Default</Badge> : null}
              <ToneBadge tone={dest.verified ? "success" : "warning"}>
                {dest.verified ? "Verified" : "Not verified"}
              </ToneBadge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function ClientDetailView({ id }: { id: string }) {
  const router = useRouter();
  const q = useQuery(clientQuery(id));
  const update = useUpdateClient(id);
  const signOut = useSignOutClient();
  const remove = useDeleteClient();
  const [dialog, setDialog] = useState<null | "edit" | "message" | "signout" | "disable" | "delete">(null);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/admin/clients">
        <ArrowLeft /> All clients
      </Link>
    </Button>
  );

  if (q.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <DetailSkeleton />
      </div>
    );
  }
  if (q.isError) {
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422);
    return (
      <div className="space-y-4">
        {back}
        {missing ? (
          <EmptyState icon={UserX} title="Client not found" description="They may have been deleted.">
            <Button asChild variant="outline">
              <Link href="/admin/clients">Back to clients</Link>
            </Button>
          </EmptyState>
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )}
      </div>
    );
  }

  const d = q.data;
  const c = d.client;
  const close = () => setDialog(null);

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            {initials(c.display_name, "#")}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{c.display_name || "Unnamed client"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular">{c.phone_e164}</span>
              <Badge variant={c.plan === "free" ? "outline" : "secondary"}>{planLabel(c.plan)}</Badge>
              <ToneBadge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Disabled"}</ToneBadge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog("message")}>
            <Send /> Message
          </Button>
          <Button variant="outline" onClick={() => setDialog("edit")}>
            <Pencil /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {c.is_active ? (
                <DropdownMenuItem onSelect={() => setDialog("disable")}>
                  <Power /> Disable account
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    update.mutate({ is_active: true }, { onSuccess: () => toast.success("Account enabled") })
                  }
                >
                  <CheckCircle2 /> Enable account
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setDialog("signout")}>
                <LogOut /> Sign out everywhere
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                <Trash2 /> Delete client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!c.is_active ? (
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          This account is disabled: the client can&apos;t sign in and gets no alerts.
        </p>
      ) : null}

      <Tabs defaultValue="overview" className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mailboxes">
              <Inbox /> Mailboxes <span className="tabular text-muted-foreground">{d.mailboxes.length}</span>
            </TabsTrigger>
            <TabsTrigger value="rules">
              <ListFilter /> Rules <span className="tabular text-muted-foreground">{d.rules.length}</span>
            </TabsTrigger>
            <TabsTrigger value="emails">Recent emails</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp activity</TabsTrigger>
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <OverviewTab d={d} />
        </TabsContent>
        <TabsContent value="mailboxes">
          {d.mailboxes.length === 0 ? (
            <EmptyState icon={Inbox} title="No mailboxes" description="This client hasn't connected an inbox yet." />
          ) : (
            <MailboxTable items={d.mailboxes} showOwner={false} />
          )}
        </TabsContent>
        <TabsContent value="rules">
          {d.rules.length === 0 ? (
            <EmptyState icon={ListFilter} title="No rules" description="Without rules, no email is forwarded to WhatsApp." />
          ) : (
            <RuleTable items={d.rules} showOwner={false} />
          )}
        </TabsContent>
        <TabsContent value="emails">
          <EmailsTab d={d} />
        </TabsContent>
        <TabsContent value="whatsapp">
          <NotificationList
            items={d.recent_notifications}
            emptyTitle="No WhatsApp messages yet"
            emptyDescription="Alerts, reminders and replies sent to this client appear here."
          />
        </TabsContent>
        <TabsContent value="destinations">
          <DestinationsTab d={d} />
        </TabsContent>
      </Tabs>

      <EditClientDialog client={c} open={dialog === "edit"} onOpenChange={(o) => !o && close()} />
      <MessageClientDialog client={c} open={dialog === "message"} onOpenChange={(o) => !o && close()} />
      <ConfirmDialog
        open={dialog === "disable"}
        onOpenChange={(o) => !o && close()}
        title="Disable this account?"
        description="They're signed out everywhere, can't sign in again and get no alerts until you enable the account."
        confirmLabel="Disable account"
        pending={update.isPending}
        onConfirm={() =>
          update.mutate(
            { is_active: false },
            {
              onSuccess: () => {
                toast.success("Account disabled");
                close();
              },
            },
          )
        }
      />
      <ConfirmDialog
        open={dialog === "signout"}
        onOpenChange={(o) => !o && close()}
        title="Sign out everywhere?"
        description="Every device this client is signed in on is signed out. Their alerts keep working."
        confirmLabel="Sign out everywhere"
        destructive={false}
        pending={signOut.isPending}
        onConfirm={() =>
          signOut.mutate(id, {
            onSuccess: () => {
              toast.success("Signed out on every device");
              close();
            },
          })
        }
      />
      <TypedConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title="Delete this client for good?"
        description={
          <>
            <p>
              This deletes <span className="font-medium text-foreground">{c.display_name || c.phone_e164}</span> and
              everything they own: mailboxes, rules, matched emails, WhatsApp history and dates.
            </p>
            <p>This can&apos;t be undone.</p>
          </>
        }
        phrase={c.phone_e164}
        confirmLabel="Delete client"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success("Client deleted");
              router.replace("/admin/clients");
            },
          })
        }
      />
    </div>
  );
}
