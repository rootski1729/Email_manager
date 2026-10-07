"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "@/components/common/brand";
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
import { maskPhone } from "@/lib/format";
import { NAV, isActive } from "./nav-items";

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const mailboxes = useQuery(mailboxesQuery);
  const attention = mailboxes.data?.filter((m) => m.status === "reauth_required" || m.status === "error").length ?? 0;
  const badges: Record<string, number> = { "/mailboxes": attention };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent [&_svg]:size-7">
              <Link href="/dashboard" aria-label="Home" onClick={() => setOpenMobile(false)}>
                <Brand className="text-foreground" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV.map((item) => {
                const active = isActive(pathname, item);
                const badge = badges[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-9 gap-2.5 px-2.5 text-sidebar-foreground [&_svg]:text-sidebar-foreground/70 data-active:[&_svg]:text-sidebar-primary"
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                        <item.icon className="size-4.5!" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge ? (
                      <SidebarMenuBadge
                        className="top-2! rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground peer-hover/menu-button:text-sidebar-primary-foreground peer-data-active/menu-button:text-sidebar-primary-foreground"
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
