"use client";

import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";
import { QueueHealth } from "./queue-health";
import { WahaCard } from "./waha-card";

export function AdminView() {
  const { user, isAdmin } = useAuth();
  if (!user) return <Skeleton className="h-96 rounded-xl" />;
  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admins only"
        description="This page manages the shared WhatsApp sender and background queues."
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Operations" description="Pair the WhatsApp sender, and watch queues, workers and dead letters." className="pb-0" />
      <WahaCard />
      <QueueHealth />
    </div>
  );
}
