import type { Metadata } from "next";

import { ToolsView } from "@/components/admin/tools/tools-view";

export const metadata: Metadata = { title: "Test lab" };

export default async function AdminToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab, rule } = await searchParams;
  const t = typeof tab === "string" ? tab : undefined;
  const r = typeof rule === "string" ? rule : undefined;
  return <ToolsView key={`${t ?? ""}:${r ?? ""}`} tab={t} ruleId={r} />;
}
