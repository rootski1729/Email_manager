import type { Metadata } from "next";

import { DestinationsView } from "@/components/destinations/destinations-view";

export const metadata: Metadata = { title: "WhatsApp" };

export default function DestinationsPage() {
  return <DestinationsView />;
}
