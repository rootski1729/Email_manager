import type { Metadata } from "next";

import { AiView } from "@/components/admin/ai/ai-view";

export const metadata: Metadata = { title: "AI assistant" };

export default function AdminAiPage() {
  return <AiView />;
}
