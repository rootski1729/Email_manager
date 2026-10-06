"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NAV_MOBILE, isActive } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium outline-none focus-visible:bg-accent";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {NAV_MOBILE.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(item, active ? "text-primary" : "text-muted-foreground")}
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        );
      })}
      <button type="button" onClick={() => setOpenMobile(true)} className={cn(item, "text-muted-foreground")}>
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
