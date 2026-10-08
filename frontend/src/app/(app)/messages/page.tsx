import type { Metadata } from "next";
import { Suspense } from "react";

import { MessagesSkeleton } from "@/components/common/skeletons";
import { MessagesView } from "@/components/messages/messages-view";

export const metadata: Metadata = { title: "Important mail" };

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessagesView />
    </Suspense>
  );
}
