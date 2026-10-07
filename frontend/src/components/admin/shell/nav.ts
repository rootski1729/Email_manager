import {
  Database,
  FlaskConical,
  History,
  Inbox,
  LayoutDashboard,
  ListFilter,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Manage",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/clients", label: "Clients", icon: Users },
      { href: "/admin/mailboxes", label: "Mailboxes", icon: Inbox },
      { href: "/admin/rules", label: "Rules", icon: ListFilter },
    ],
  },
  {
    label: "Connections",
    items: [
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/admin/google", label: "Gmail setup", icon: Mail },
      { href: "/admin/ai", label: "AI assistant", icon: Sparkles },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/admin/tools", label: "Test lab", icon: FlaskConical },
      { href: "/admin/database", label: "Database", icon: Database },
      { href: "/admin/audit", label: "Activity log", icon: History },
      { href: "/admin/admins", label: "Admins", icon: ShieldCheck },
    ],
  },
];

export function isAdminNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
