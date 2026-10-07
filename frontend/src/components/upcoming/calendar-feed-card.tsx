"use client";

import { useQuery } from "@tanstack/react-query";
import { Apple, CalendarSync, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { calendarFeedQuery, useRotateCalendarFeed } from "@/lib/api/deadlines";

export function CalendarFeedCard() {
  const feed = useQuery(calendarFeedQuery);
  const rotate = useRotateCalendarFeed();
  const [confirming, setConfirming] = useState(false);
  const f = feed.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSync className="size-4 text-muted-foreground" /> Add to your calendar
        </CardTitle>
        <CardDescription>
          Confirmed dates appear in Google or Apple Calendar and stay in sync. Calendar apps refresh it every few hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {feed.isError ? (
          <ErrorState error={feed.error} title="Couldn't load your calendar link" onRetry={() => void feed.refetch()} />
        ) : !f ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={f.url}
                aria-label="Private calendar feed URL"
                className="min-w-0 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton value={f.url} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Button asChild variant="outline">
                <a
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(f.webcal_url)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Google Calendar <ExternalLink />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={f.webcal_url}>
                  <Apple /> Apple Calendar
                </a>
              </Button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Anyone with this link can see your dates. Shared it by mistake? Get a new one.
              </p>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                onClick={() => setConfirming(true)}
                disabled={rotate.isPending}
              >
                <RefreshCw /> New link
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Replace your calendar link?"
        description="The current link stops working right away. Calendars subscribed to it stop updating until you add the new link."
        confirmLabel="Get a new link"
        pending={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              toast.success("New calendar link ready", { description: "Subscribe to it again in your calendar app." });
            },
          })
        }
      />
    </Card>
  );
}
