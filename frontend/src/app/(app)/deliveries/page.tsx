import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/common/stat";
import { DeliveriesView } from "@/components/deliveries/deliveries-view";

export const metadata: Metadata = { title: "WhatsApp activity" };

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <DeliveriesView />
    </Suspense>
  );
}
