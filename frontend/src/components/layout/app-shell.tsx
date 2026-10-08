"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { BrandMark } from "@/components/common/brand";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";
import { RealtimeProvider } from "@/lib/realtime/realtime-provider";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { TopBar } from "./top-bar";

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh w-full" aria-busy="true" aria-label="Restoring your session">
      <div className="hidden w-64 flex-col gap-3 border-r bg-sidebar p-4 md:flex">
        <div className="flex items-center gap-2">
          <BrandMark />
          <Skeleton className="h-4 w-28 bg-sidebar-foreground/6" />
        </div>
        <div className="mt-6 space-y-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full bg-sidebar-foreground/6" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 md:p-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-24 rounded-2xl" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const dashboard = pathname === "/dashboard";
  const wide = dashboard || pathname === "/messages" || pathname?.startsWith("/messages/");

  useEffect(() => {
    if (status === "anonymous") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") return <ShellSkeleton />;

  return (
    <RealtimeProvider enabled>
      <SidebarProvider defaultOpen={defaultOpen}>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <AppSidebar />
        <SidebarInset className={cn("min-w-0", dashboard && "bg-canvas")}>
          <TopBar className={dashboard ? "border-transparent bg-canvas/90" : "bg-background/85"} />
          <main
            id="main"
            className={cn(
              "mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-16",
              // Mail pages put an Assistant beside the content on wide screens, and the dashboard sets cards side by
              // side, so they get more room there.
              wide && "xl:max-w-7xl",
            )}
          >
            {children}
          </main>
        </SidebarInset>
        <MobileNav />
      </SidebarProvider>
    </RealtimeProvider>
  );
}
