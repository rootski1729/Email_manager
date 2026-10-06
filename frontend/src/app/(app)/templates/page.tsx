import type { Metadata } from "next";

import { TemplatesView } from "@/components/templates/templates-view";

export const metadata: Metadata = { title: "Send email" };

export default function TemplatesPage() {
  return <TemplatesView />;
}
