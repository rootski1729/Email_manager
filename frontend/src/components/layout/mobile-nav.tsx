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
    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:bg-accent active:[&>span:first-child]:scale-95";
  const pill = "flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {NAV_MOBILE.map((n) => {
        const active = isActive(pathname, n);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            // A tap shouldn't leave a focus ring behind (see AppSidebar); keyboard activation keeps focus.
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className={cn(item, active ? "text-foreground" : "text-muted-foreground")}
          >
            <span className={cn(pill, active && "bg-accent text-brand-ink")}>
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
        <span className={cn(pill, inMore && "bg-accent text-brand-ink")}>
          <Menu className="size-5" />
        </span>
        More
      </button>
    </nav>
  );
}
