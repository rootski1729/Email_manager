import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/common/stat";
import { MessagesView } from "@/components/messages/messages-view";

export const metadata: Metadata = { title: "Important mail" };

export default function MessagesPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <MessagesView />
    </Suspense>
  );
}
