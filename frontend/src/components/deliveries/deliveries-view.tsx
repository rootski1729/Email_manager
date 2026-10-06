"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/stat";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { destinationsQuery, notificationsQuery } from "@/lib/api/queries";
import { NOTIFICATION_STATUSES, type NotificationStatus } from "@/lib/api/types";
import { NOTIFICATION_STATUS } from "@/lib/status";
import { NotificationCard } from "./notification-card";

const ALL = "all";

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

  return (
    <div>
      <PageHeader
        title="Deliveries"
        description="Every WhatsApp message MailSentinel has queued, with its delivery status. Updates arrive live."
      />
      <Tabs
        value={status ?? ALL}
        onValueChange={(v) => router.replace(v === ALL ? pathname : `${pathname}?status=${v}`, { scroll: false })}
        className="mb-4"
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <TabsList className="w-max">
            <TabsTrigger value={ALL}>All</TabsTrigger>
            {NOTIFICATION_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {NOTIFICATION_STATUS[s].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={status ? `No ${NOTIFICATION_STATUS[status].label.toLowerCase()} deliveries` : "No deliveries yet"}
          description={
            status
              ? NOTIFICATION_STATUS[status].hint
              : "When a rule matches, the WhatsApp alert and its delivery status appear here."
          }
        />
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
                Load more
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
