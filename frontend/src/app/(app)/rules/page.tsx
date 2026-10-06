import type { Metadata } from "next";

import { RulesList } from "@/components/rules/rules-list";

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return <RulesList />;
}
