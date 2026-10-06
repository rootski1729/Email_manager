import type { Metadata } from "next";

import { EditTemplateView } from "@/components/templates/edit-template-view";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditTemplateView id={id} />;
}
