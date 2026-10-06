"use client";

import { useQuery } from "@tanstack/react-query";
import { Laptop, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { meQuery, settingsQuery, useRevokeAllSessions } from "@/lib/api/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { ComposeSettingsCard } from "./compose-settings-card";
import { NotificationSettingsCard } from "./notification-settings-card";
import { ProfileCard } from "./profile-card";

const LIMIT_LABELS: Record<string, string> = {
  mailboxes: "Mailboxes",
  rules: "Rules",
  daily_alerts: "Alerts per day",
  daily_emails: "Emails sent per day",
  templates: "Email templates",
  alerts_per_day: "Alerts per day",
  destinations: "Destinations",
};

function prettyKey(k: string) {
  return LIMIT_LABELS[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function SettingsView() {
  const me = useQuery(meQuery);
  const settings = useQuery(settingsQuery);
  const revoke = useRevokeAllSessions();
  const { signOut } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, alert delivery preferences and account security." className="pb-0" />
      {me.isError ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}
      {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {me.data ? <ProfileCard key={me.data.id} user={me.data} /> : <Skeleton className="h-72 rounded-xl" />}
          {settings.data ? (
            <NotificationSettingsCard
              key={JSON.stringify({ ...settings.data, compose_enabled: undefined })}
              settings={settings.data}
            />
          ) : (
            <Skeleton className="h-96 rounded-xl" />
          )}
          {settings.data ? <ComposeSettingsCard settings={settings.data} /> : <Skeleton className="h-28 rounded-xl" />}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Plan
                {me.data ? <Badge className="capitalize">{me.data.plan}</Badge> : null}
              </CardTitle>
              <CardDescription>Limits that apply to your account.</CardDescription>
            </CardHeader>
            <CardContent>
              {settings.data ? (
                <dl className="divide-y text-sm">
                  {Object.entries(settings.data.plan_limits ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-2">
                      <dt className="text-muted-foreground">{prettyKey(k)}</dt>
                      <dd className="font-medium tabular">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Skeleton className="h-24" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
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
              <CardTitle>Security</CardTitle>
              <CardDescription>Lost a device? Sign out everywhere, including this browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full" onClick={() => setConfirmRevoke(true)}>
                <LogOut /> Sign out all devices
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Sign out of every device?"
        description="All sessions end immediately, including this one. You'll need a new WhatsApp code to sign back in."
        confirmLabel="Sign out everywhere"
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(undefined, {
            onSuccess: async () => {
              await signOut();
              toast.success("Signed out of all devices");
              router.replace("/login");
            },
          })
        }
      />
    </div>
  );
}
