import type { Metadata } from "next";

import { DatabaseView } from "@/components/admin/database/database-view";

export const metadata: Metadata = { title: "Database" };

export default async function AdminDatabasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { table } = await searchParams;
  return <DatabaseView initialTable={typeof table === "string" ? table : undefined} />;
}
