import type { Metadata } from "next";

import { AdminsView } from "@/components/admin/admins/admins-view";

export const metadata: Metadata = { title: "Admins" };

export default function AdminAdminsPage() {
  return <AdminsView />;
}
