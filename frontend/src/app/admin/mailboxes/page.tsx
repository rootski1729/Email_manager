import type { Metadata } from "next";

import { MailboxesView } from "@/components/admin/mailboxes/mailboxes-view";

export const metadata: Metadata = { title: "Mailboxes" };

export default async function AdminMailboxesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status } = await searchParams;
  const initial = typeof status === "string" ? status : undefined;
  return <MailboxesView key={initial ?? "all"} initialStatus={initial} />;
}
