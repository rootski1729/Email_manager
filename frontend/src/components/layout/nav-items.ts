import {
  Bell,
  FileText,
  Send,
  Inbox,
  LayoutDashboard,
  ListFilter,
  type LucideIcon,
  MailCheck,
  MessageCircle,
  Settings,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
}

export const NAV_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/messages", label: "Matched mail", icon: MailCheck },
  { href: "/deliveries", label: "Deliveries", icon: Bell },
  { href: "/sent", label: "Sent emails", icon: Send },
];

export const NAV_SETUP: NavItem[] = [
  { href: "/mailboxes", label: "Mailboxes", icon: Inbox },
  { href: "/rules", label: "Rules", icon: ListFilter },
  { href: "/templates", label: "Email templates", icon: FileText },
  { href: "/destinations", label: "WhatsApp", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NAV_ADMIN: NavItem[] = [{ href: "/admin", label: "Admin", icon: ShieldCheck, admin: true }];

export const NAV_MOBILE: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/messages", label: "Mail", icon: MailCheck },
  { href: "/rules", label: "Rules", icon: ListFilter },
  { href: "/deliveries", label: "Alerts", icon: Bell },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
