import type { Metadata } from "next";

import { RulesView } from "@/components/admin/rules/rules-view";

export const metadata: Metadata = { title: "Rules" };

export default async function AdminRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await searchParams;
  const clientId = typeof client === "string" ? client : undefined;
  return <RulesView key={clientId ?? "all"} clientId={clientId} />;
}
