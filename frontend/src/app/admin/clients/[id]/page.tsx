import type { Metadata } from "next";

import { ClientDetailView } from "@/components/admin/clients/client-detail-view";

export const metadata: Metadata = { title: "Client" };

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetailView key={id} id={id} />;
}
