import type { Metadata } from "next";

import { MailboxesView } from "@/components/mailboxes/mailboxes-view";

export const metadata: Metadata = { title: "Mailboxes" };

export default function MailboxesPage() {
  return <MailboxesView />;
}
