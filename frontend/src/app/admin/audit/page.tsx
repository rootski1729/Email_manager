import type { Metadata } from "next";

import { AuditView } from "@/components/admin/audit/audit-view";

export const metadata: Metadata = { title: "Activity log" };

export default function AdminAuditPage() {
  return <AuditView />;
}
