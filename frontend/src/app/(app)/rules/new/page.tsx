import type { Metadata } from "next";

import { RuleEditor } from "@/components/rules/rule-editor";

export const metadata: Metadata = { title: "Watch for something new" };

export default function NewRulePage() {
  return <RuleEditor />;
}
