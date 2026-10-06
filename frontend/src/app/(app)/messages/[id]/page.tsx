import type { Metadata } from "next";

import { MessageDetailView } from "@/components/messages/message-detail-view";

export const metadata: Metadata = { title: "Email" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MessageDetailView id={id} />;
}
