import type { Metadata } from "next";

import { RulesList } from "@/components/rules/rules-list";

export const metadata: Metadata = { title: "What to watch" };

export default function RulesPage() {
  return <RulesList />;
}
