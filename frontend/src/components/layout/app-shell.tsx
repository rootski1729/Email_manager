"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Brand, BrandMark } from "@/components/common/brand";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";
import { RealtimeProvider } from "@/lib/realtime/realtime-provider";
import { AppSidebar } from "./app-sidebar";
import { ConnectionIndicator } from "./connection-indicator";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

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
        <Skeleton className="mt-8 h-24 rounded-xl" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
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
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:px-4">
            <SidebarTrigger className="hidden md:inline-flex" />
            <Separator orientation="vertical" className="mr-1 hidden md:block data-vertical:h-4 data-vertical:self-center" />
            <Link href="/dashboard" aria-label="Home" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring md:hidden">
              <Brand />
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <ConnectionIndicator />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16">
            {children}
          </main>
        </SidebarInset>
        <MobileNav />
      </SidebarProvider>
    </RealtimeProvider>
  );
}
