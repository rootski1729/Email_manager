import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin/shell/admin-shell";

export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const defaultOpen = store.get("sidebar_state")?.value !== "false";
  return <AdminShell defaultOpen={defaultOpen}>{children}</AdminShell>;
}
