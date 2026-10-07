import {
  Briefcase,
  FileBadge,
  GraduationCap,
  Landmark,
  ListFilter,
  type LucideIcon,
  Package,
  Plane,
  Receipt,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Lucide names sent by GET /rules/packs, mapped statically so unused icons are tree-shaken. */
const ICONS: Record<string, { icon: LucideIcon; tile: string }> = {
  "graduation-cap": { icon: GraduationCap, tile: "bg-chart-3/14 text-chart-3" },
  briefcase: { icon: Briefcase, tile: "bg-chart-1/14 text-chart-1" },
  landmark: { icon: Landmark, tile: "bg-chart-4/16 text-chart-4" },
  receipt: { icon: Receipt, tile: "bg-chart-2/16 text-chart-2" },
  "shield-alert": { icon: ShieldAlert, tile: "bg-destructive/12 text-destructive" },
  package: { icon: Package, tile: "bg-chart-5/14 text-chart-5" },
  plane: { icon: Plane, tile: "bg-brand/15 text-brand-ink" },
  "file-badge": { icon: FileBadge, tile: "bg-secondary text-secondary-foreground" },
};

export function PackIcon({ name, className }: { name: string; className?: string }) {
  const entry = ICONS[name] ?? { icon: ListFilter, tile: "bg-brand/15 text-brand-ink" };
  const Icon = entry.icon;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", entry.tile, className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
