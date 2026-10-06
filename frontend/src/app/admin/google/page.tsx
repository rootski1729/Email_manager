import type { Metadata } from "next";

import { GoogleView } from "@/components/admin/google/google-view";

export const metadata: Metadata = { title: "Gmail setup" };

export default function AdminGooglePage() {
  return <GoogleView />;
}
