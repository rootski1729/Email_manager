"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight, Laptop, LogOut, MessageCircle, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader, Section } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { meQuery, settingsQuery, useRevokeAllSessions } from "@/lib/api/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { AssistantSettingsCard } from "./assistant-settings-card";
import { ComposeSettingsCard } from "./compose-settings-card";
import { MutedSendersCard } from "./muted-senders-card";
import { NotificationSettingsCard } from "./notification-settings-card";
import { ProfileCard } from "./profile-card";

const LIMIT_LABELS: Record<string, string> = {
  mailboxes: "Mailboxes",
  rules: "Things to watch",
  daily_alerts: "Alerts per day",
  daily_emails: "Emails you can send per day",
  templates: "Email templates",
  alerts_per_day: "Alerts per day",
  destinations: "WhatsApp numbers and groups",
};

function prettyKey(k: string) {
  return LIMIT_LABELS[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function LinkRow({ href, icon: Icon, title, hint }: { href: string; icon: LucideIcon; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-4 outline-none transition-colors hover:border-brand/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function SettingsView() {
  const me = useQuery(meQuery);
  const settings = useQuery(settingsQuery);
  const revoke = useRevokeAllSessions();
  const { signOut } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const s = settings.data;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title="Settings" description="WhatsApp, notifications and your account." className="pb-0" />
      {me.isError ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}
      {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : null}

      <Section id="whatsapp" title="WhatsApp">
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkRow href="/destinations" icon={MessageCircle} title="Who gets alerts" hint="Your number, other numbers, groups" />
          <LinkRow href="/deliveries" icon={Activity} title="WhatsApp activity" hint="Every message we sent, and if it arrived" />
        </div>
      </Section>

      <Section id="notifications" title="Notifications">
        {s ? (
          <NotificationSettingsCard
            key={JSON.stringify([s.quiet_hours, s.digest, s.daily_cap, s.weekly_recap])}
            settings={s}
          />
        ) : (
          <Skeleton className="h-80 rounded-xl" />
        )}
        {s ? <AssistantSettingsCard settings={s} /> : <Skeleton className="h-28 rounded-xl" />}
        {s ? (
          <MutedSendersCard key={s.muted_senders.join("\n")} settings={s} />
        ) : (
          <Skeleton className="h-48 rounded-xl" />
        )}
      </Section>

      <Section id="send" title="Sending email">
        {s ? <ComposeSettingsCard settings={s} /> : <Skeleton className="h-28 rounded-xl" />}
      </Section>

      <Section id="account" title="Account">
        {me.data ? <ProfileCard key={me.data.id} user={me.data} /> : <Skeleton className="h-64 rounded-xl" />}
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Look</CardTitle>
            </CardHeader>
            <CardContent>
              <ToggleGroup
                type="single"
                variant="outline"
                value={theme ?? "system"}
                onValueChange={(v) => v && setTheme(v)}
                className="w-full"
                aria-label="Theme"
              >
                <ToggleGroupItem value="light" className="flex-1">
                  <Sun /> Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" className="flex-1">
                  <Moon /> Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" className="flex-1">
                  <Laptop /> Auto
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Your plan
                {me.data ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                    {me.data.plan}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s ? (
                <dl className="divide-y text-sm">
                  {Object.entries(s.plan_limits ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-1.5">
                      <dt className="text-muted-foreground">{prettyKey(k)}</dt>
                      <dd className="font-medium tabular">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Skeleton className="h-20" />
              )}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
            <CardDescription>Lost your phone or used a shared computer? Sign out everywhere at once.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              <LogOut /> Sign out
            </Button>
            <Button variant="destructive" onClick={() => setConfirmRevoke(true)}>
              Sign out on all devices
            </Button>
          </CardContent>
        </Card>
      </Section>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Sign out on every device?"
        description="You'll be signed out everywhere, including here. To sign back in, we'll send a new code to your WhatsApp."
        confirmLabel="Sign out everywhere"
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(undefined, {
            onSuccess: async () => {
              await signOut();
              toast.success("Signed out on all devices");
              router.replace("/login");
            },
          })
        }
      />
    </div>
  );
}
