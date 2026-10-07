import {
  Briefcase,
  CalendarDays,
  CreditCard,
  GraduationCap,
  Hourglass,
  type LucideIcon,
  Plane,
  Users,
} from "lucide-react";

import type { EventKind } from "@/lib/api/types";

export interface KindMeta {
  label: string;
  icon: LucideIcon;
  /** Icon tile background + foreground (neutral: the icon names the kind, colour stays for the dot). */
  tile: string;
  /** Small dot (calendar, legend). */
  dot: string;
  /** Left accent stripe on cards. */
  accent: string;
}

export const EVENT_KIND: Record<EventKind, KindMeta> = {
  exam: {
    label: "Exam",
    icon: GraduationCap,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-chart-3",
    accent: "before:bg-chart-3",
  },
  interview: {
    label: "Interview",
    icon: Briefcase,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-chart-1",
    accent: "before:bg-chart-1",
  },
  deadline: {
    label: "Deadline",
    icon: Hourglass,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-destructive",
    accent: "before:bg-destructive",
  },
  payment: {
    label: "Payment",
    icon: CreditCard,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-chart-2",
    accent: "before:bg-chart-2",
  },
  meeting: {
    label: "Meeting",
    icon: Users,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-chart-4",
    accent: "before:bg-chart-4",
  },
  travel: {
    label: "Travel",
    icon: Plane,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-chart-5",
    accent: "before:bg-chart-5",
  },
  other: {
    label: "Other",
    icon: CalendarDays,
    tile: "bg-secondary text-muted-foreground",
    dot: "bg-muted-foreground/60",
    accent: "before:bg-muted-foreground/40",
  },
};

export function kindMeta(kind: EventKind | null | undefined): KindMeta {
  return (kind && EVENT_KIND[kind]) || EVENT_KIND.other;
}
