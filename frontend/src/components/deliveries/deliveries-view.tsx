"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BellOff, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { TestAlertButton } from "@/components/dashboard/test-alert-button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/stat";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { destinationsQuery, notificationsQuery } from "@/lib/api/queries";
import { NOTIFICATION_STATUSES, type NotificationStatus } from "@/lib/api/types";
import { ALERT_STATUS } from "@/lib/status";
import { NotificationCard } from "./notification-card";

const ALL = "all";
/** The only filters most people need. Any other ?status= still works (and can be cleared). */
const SIMPLE: { value: string; label: string }[] = [
  { value: ALL, label: "Everything" },
  { value: "queued", label: "Waiting" },
  { value: "dead", label: "Failed" },
];

export function DeliveriesView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("status");
  const status = raw && (NOTIFICATION_STATUSES as string[]).includes(raw) ? (raw as NotificationStatus) : undefined;
  const list = useInfiniteQuery(notificationsQuery(status));
  const destinations = useQuery(destinationsQuery);
  const destMap = useMemo(() => new Map((destinations.data ?? []).map((d) => [d.id, d])), [destinations.data]);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const isSimple = !status || SIMPLE.some((f) => f.value === status);
  const setStatus = (v: string) => router.replace(v === ALL ? pathname : `${pathname}?status=${v}`, { scroll: false });

  return (
    <div>
      <PageHeader
        title="WhatsApp activity"
        back={{ href: "/settings", label: "Settings" }}
        description="Every WhatsApp message we've sent you, and whether it arrived. This page updates by itself."
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={isSimple ? (status ?? ALL) : ""}
          onValueChange={(v) => v && setStatus(v)}
          aria-label="Show"
        >
          {SIMPLE.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="px-4">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!isSimple && status ? (
          <Button variant="secondary" size="sm" onClick={() => setStatus(ALL)}>
            Showing: {ALERT_STATUS[status].label} <X />
          </Button>
        ) : null}
      </div>

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={status === "dead" ? "Nothing failed" : status ? "Nothing here" : "No WhatsApp messages yet"}
          description={
            status === "dead"
              ? "Every message reached WhatsApp. Nice."
              : status
                ? "Nothing in this list right now."
                : "When an important email arrives, the WhatsApp alert shows up here."
          }
        >
          {!status ? <TestAlertButton size="default" /> : null}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((n) => (
              <NotificationCard key={n.id} n={n} destinations={destMap} />
            ))}
          </ul>
          <div className="mt-4 flex justify-center">
            {list.hasNextPage ? (
              <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? <Spinner /> : null}
                Show older
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">That&apos;s everything.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
