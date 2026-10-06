"use client";

import { useQueries } from "@tanstack/react-query";

import { NotificationList } from "@/components/admin/common/notification-list";
import { ListSkeleton } from "@/components/common/stat";
import { ErrorState } from "@/components/common/error-state";
import { notificationsQuery } from "@/lib/admin/queries";

/** WhatsApp messages that failed (still retrying) or gave up, newest first, with Retry. */
export function FailedMessages({ limit = 20 }: { limit?: number }) {
  const [dead, failed] = useQueries({
    queries: [notificationsQuery("dead", limit), notificationsQuery("failed", limit)],
  });

  if (dead.isPending || failed.isPending) return <ListSkeleton rows={3} />;
  if (dead.isError || failed.isError) {
    return (
      <ErrorState
        error={dead.error ?? failed.error}
        onRetry={() => {
          void dead.refetch();
          void failed.refetch();
        }}
      />
    );
  }
  const items = [...dead.data, ...failed.data]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);

  return (
    <NotificationList
      items={items}
      emptyTitle="No failed WhatsApp messages"
      emptyDescription="Every alert was delivered or is still on its way."
    />
  );
}
