import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/common/stat";
import { SentView } from "@/components/sent/sent-view";

export const metadata: Metadata = { title: "Sent emails" };

export default function SentPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <SentView />
    </Suspense>
  );
}
