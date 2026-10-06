import type { Metadata } from "next";

import { EditRuleView } from "@/components/rules/edit-rule-view";

export const metadata: Metadata = { title: "What to watch" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditRuleView id={id} />;
}
