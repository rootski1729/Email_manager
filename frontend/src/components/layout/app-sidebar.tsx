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
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <Link href="/dashboard" aria-label="Home" onClick={() => setOpenMobile(false)}>
                <Brand className="text-sidebar-accent-foreground" />
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
                      size="lg"
                      isActive={active}
                      tooltip={item.label}
                      className="relative h-10 gap-3 text-[0.9rem] text-sidebar-foreground/80 group-data-[collapsible=icon]:size-10! before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity data-active:text-sidebar-accent-foreground data-active:before:opacity-100 data-active:[&_svg]:text-sidebar-primary group-data-[collapsible=icon]:before:hidden"
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                        <item.icon className="size-[18px]!" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge ? (
                      <SidebarMenuBadge
                        className="top-2.5! rounded-full bg-warning px-1.5 text-warning-foreground dark:text-warning-foreground"
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
      <SidebarFooter>
        {user ? (
          <div className="truncate px-2 pb-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            Signed in as {user.display_name || maskPhone(user.phone_e164)}
          </div>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
