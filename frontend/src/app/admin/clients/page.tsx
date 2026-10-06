import type { Metadata } from "next";

import { ClientsView } from "@/components/admin/clients/clients-view";

export const metadata: Metadata = { title: "Clients" };

export default function AdminClientsPage() {
  return <ClientsView />;
}
