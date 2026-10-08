"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

import { BrandMark } from "@/components/common/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { mailboxesQuery } from "@/lib/api/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { APP_NAME } from "@/lib/config";
import { maskPhone } from "@/lib/format";
import { NAV, isActive } from "./nav-items";

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const mailboxes = useQuery(mailboxesQuery);
  const attention = mailboxes.data?.filter((m) => m.status === "reauth_required" || m.status === "error").length ?? 0;
  const badges: Record<string, number> = { "/mailboxes": attention };
  // After a pointer click, drop focus from the nav link: otherwise the next key press (scrolling with the arrow
  // keys, say) makes the browser treat that focus as keyboard focus and the ring appears on the clicked item.
  // Keyboard activation (detail === 0) keeps focus where it is.
  const onNavigate = (e: MouseEvent<HTMLAnchorElement>) => {
    setOpenMobile(false);
    if (e.detail > 0) e.currentTarget.blur();
  };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="h-14 gap-2.5 hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:[&_svg]:size-7 [&_svg]:size-9"
            >
              <Link href="/dashboard" aria-label="Home" onClick={onNavigate}>
                <BrandMark />
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-lg font-bold tracking-tight text-foreground">{APP_NAME}</span>
                  <span className="truncate text-xs text-muted-foreground">Important mail, on WhatsApp</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item);
                const badge = badges[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      // The current page is a filled soft-iris pill with a short accent bar at its left edge.
                      className="relative h-10 gap-3 px-3 text-sidebar-foreground before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity data-active:font-semibold data-active:before:opacity-100 group-data-[collapsible=icon]:before:hidden [&_svg]:text-sidebar-foreground/70 [&_svg]:transition-colors hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary"
                    >
                      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}>
                        <item.icon className="size-4.5!" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge ? (
                      <SidebarMenuBadge
                        className="top-2.5! right-2! rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground peer-hover/menu-button:text-sidebar-primary-foreground peer-data-active/menu-button:text-sidebar-primary-foreground"
                        aria-label={`${badge} need${badge === 1 ? "s" : ""} attention`}
                      >
                        {badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        {user ? (
          <div className="mx-1 border-t border-sidebar-border px-1.5 pt-3 pb-1 text-xs leading-snug">
            <span className="block text-sidebar-foreground/60">Signed in as</span>
            <span className="block truncate font-medium text-sidebar-foreground">
              {user.display_name || maskPhone(user.phone_e164)}
            </span>
          </div>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
