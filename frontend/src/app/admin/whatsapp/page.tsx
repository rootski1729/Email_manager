import type { Metadata } from "next";

import { WhatsAppView } from "@/components/admin/whatsapp/whatsapp-view";

export const metadata: Metadata = { title: "WhatsApp" };

export default function AdminWhatsAppPage() {
  return <WhatsAppView />;
}
