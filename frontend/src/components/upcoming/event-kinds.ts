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
  /** Icon tile background + foreground. */
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
    tile: "bg-chart-3/14 text-chart-3",
    dot: "bg-chart-3",
    accent: "before:bg-chart-3",
  },
  interview: {
    label: "Interview",
    icon: Briefcase,
    tile: "bg-chart-1/14 text-chart-1",
    dot: "bg-chart-1",
    accent: "before:bg-chart-1",
  },
  deadline: {
    label: "Deadline",
    icon: Hourglass,
    tile: "bg-destructive/12 text-destructive",
    dot: "bg-destructive",
    accent: "before:bg-destructive",
  },
  payment: {
    label: "Payment",
    icon: CreditCard,
    tile: "bg-chart-2/16 text-chart-2",
    dot: "bg-chart-2",
    accent: "before:bg-chart-2",
  },
  meeting: {
    label: "Meeting",
    icon: Users,
    tile: "bg-chart-4/16 text-chart-4",
    dot: "bg-chart-4",
    accent: "before:bg-chart-4",
  },
  travel: {
    label: "Travel",
    icon: Plane,
    tile: "bg-chart-5/14 text-chart-5",
    dot: "bg-chart-5",
    accent: "before:bg-chart-5",
  },
  other: {
    label: "Other",
    icon: CalendarDays,
    tile: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
    accent: "before:bg-muted-foreground/40",
  },
};

export function kindMeta(kind: EventKind | null | undefined): KindMeta {
  return (kind && EVENT_KIND[kind]) || EVENT_KIND.other;
}
