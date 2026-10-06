"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NAV, NAV_MOBILE, isActive } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const inMore = !NAV_MOBILE.some((n) => isActive(pathname, n)) && NAV.some((n) => isActive(pathname, n));
  const item =
    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium outline-none focus-visible:bg-accent";
  const pill = "flex h-7 w-12 items-center justify-center rounded-full transition-colors";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {NAV_MOBILE.map((n) => {
        const active = isActive(pathname, n);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(item, active ? "text-foreground" : "text-muted-foreground")}
          >
            <span className={cn(pill, active && "bg-brand/25 text-brand-ink")}>
              <n.icon className="size-5" />
            </span>
            <span className="max-w-full truncate px-1">{n.short ?? n.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={cn(item, inMore ? "text-foreground" : "text-muted-foreground")}
      >
        <span className={cn(pill, inMore && "bg-brand/25 text-brand-ink")}>
          <Menu className="size-5" />
        </span>
        More
      </button>
    </nav>
  );
}
