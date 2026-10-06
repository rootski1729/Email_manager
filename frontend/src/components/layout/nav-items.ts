import {
  CalendarClock,
  Eye,
  House,
  Inbox,
  type LucideIcon,
  MailCheck,
  Send,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  short?: string;
  icon: LucideIcon;
  /** Other routes that belong to this section (keeps the item highlighted). */
  also?: string[];
}

/** The whole client app in seven plain places. Admins use the separate console at /admin. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/messages", label: "Important mail", short: "Mail", icon: MailCheck },
  { href: "/upcoming", label: "Upcoming", icon: CalendarClock },
  { href: "/rules", label: "What to watch", short: "Watch", icon: Eye },
  { href: "/mailboxes", label: "Mailboxes", icon: Inbox },
  { href: "/templates", label: "Send email", icon: Send, also: ["/sent"] },
  { href: "/settings", label: "Settings", icon: Settings, also: ["/destinations", "/deliveries"] },
];

/** Bottom bar on phones: the four everyday places, plus "More" for the rest. */
export const NAV_MOBILE: NavItem[] = NAV.slice(0, 4);

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActive(pathname: string, item: NavItem | string) {
  if (typeof item === "string") return matches(pathname, item);
  return matches(pathname, item.href) || (item.also ?? []).some((h) => matches(pathname, h));
}
