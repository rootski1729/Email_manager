import type { Metadata } from "next";

import { RuleEditor } from "@/components/rules/rule-editor";

export const metadata: Metadata = { title: "New rule" };

export default function NewRulePage() {
  return <RuleEditor />;
}
