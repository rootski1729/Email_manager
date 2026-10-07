"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
import { overviewQuery } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";
import { AdminBrand } from "./admin-mark";
import { ADMIN_NAV, isAdminNavActive } from "./nav";

const ITEM_CLASSES = cn(
  "relative text-sidebar-foreground/85",
  // Denim indicator bar on the active item.
  "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
  "data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-sidebar-primary",
  "data-[active=true]:[&>svg]:text-sidebar-primary",
);

export function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const overview = useQuery(overviewQuery);

  const problems = (overview.data?.mailboxes?.error ?? 0) + (overview.data?.mailboxes?.reauth_required ?? 0);
  const whatsappDown = overview.data ? overview.data.whatsapp_status !== "WORKING" : false;
  const gmailDown = overview.data ? !overview.data.google_ready : false;
  const badges: Record<string, React.ReactNode> = {
    "/admin/mailboxes": problems > 0 ? problems : null,
    "/admin/whatsapp": whatsappDown ? "!" : null,
    "/admin/google": gmailDown ? "!" : null,
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
              <Link href="/admin" aria-label="Admin overview" onClick={() => setOpenMobile(false)}>
                <AdminBrand />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {ADMIN_NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/70">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isAdminNavActive(pathname, item.href);
                  const badge = badges[item.href];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        // The shared button always renders data-active; only mark the current page.
                        data-active={active ? "true" : undefined}
                        tooltip={item.label}
                        className={ITEM_CLASSES}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badge ? (
                        <SidebarMenuBadge
                          className="bg-brand-ink text-brand-foreground"
                          aria-label="Needs attention"
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
        ))}
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 pb-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          Changes here affect every client.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
