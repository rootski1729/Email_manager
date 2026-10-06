"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAuthProvider, useAdminAuth } from "@/lib/admin/auth-provider";
import { AdminMark } from "./admin-mark";
import { AdminSidebar } from "./admin-sidebar";
import { AdminUserMenu } from "./admin-user-menu";

const LOGIN_PATH = "/admin/login";

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh w-full" aria-busy="true" aria-label="Restoring your admin session">
      <div className="hidden w-64 flex-col gap-3 bg-sidebar p-4 md:flex">
        <div className="flex items-center gap-2">
          <AdminMark />
          <Skeleton className="h-4 w-28 bg-sidebar-accent" />
        </div>
        <div className="mt-6 space-y-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full bg-sidebar-accent" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 md:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function GuardedShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  const { status } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === LOGIN_PATH;

  useEffect(() => {
    if (!isLogin && status === "anonymous") {
      const next = pathname && pathname !== "/admin" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`${LOGIN_PATH}${next}`);
    }
  }, [isLogin, status, pathname, router]);

  if (isLogin) return <>{children}</>;
  if (status !== "authenticated") return <ShellSkeleton />;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AdminSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Admin console
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <AdminUserMenu />
          </div>
        </header>
        <div id="admin-main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Admin auth + chrome. `/admin/login` renders bare; every other admin page requires an admin session. */
export function AdminShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <GuardedShell defaultOpen={defaultOpen}>{children}</GuardedShell>
    </AdminAuthProvider>
  );
}
