import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminLoginForm, AdminLoginLayout } from "@/components/admin/login/admin-login";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <AdminLoginLayout>
      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <AdminLoginForm />
      </Suspense>
    </AdminLoginLayout>
  );
}
