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
  SidebarGroupLabel,
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
import { NAV_ADMIN, NAV_MAIN, NAV_SETUP, isActive, type NavItem } from "./nav-items";

function NavGroup({ label, items, badges }: { label: string; items: NavItem[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const badge = badges?.[item.href];
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.label}>
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {badge ? (
                  <SidebarMenuBadge className="bg-amber-500/15 text-amber-800 dark:text-amber-200" aria-label={`${badge} need attention`}>
                    {badge}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { isAdmin, user } = useAuth();
  const mailboxes = useQuery(mailboxesQuery);
  const attention = mailboxes.data?.filter((m) => m.status === "reauth_required" || m.status === "error").length ?? 0;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" aria-label="Dashboard">
                <Brand />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Monitor" items={NAV_MAIN} />
        <NavGroup label="Configure" items={NAV_SETUP} badges={{ "/mailboxes": attention }} />
        {isAdmin ? <NavGroup label="Operations" items={NAV_ADMIN} /> : null}
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <div className="truncate px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Signed in as {user.display_name || maskPhone(user.phone_e164)}
          </div>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
