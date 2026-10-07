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
  "graduation-cap": { icon: GraduationCap, tile: "bg-secondary text-muted-foreground" },
  briefcase: { icon: Briefcase, tile: "bg-secondary text-muted-foreground" },
  landmark: { icon: Landmark, tile: "bg-secondary text-muted-foreground" },
  receipt: { icon: Receipt, tile: "bg-secondary text-muted-foreground" },
  "shield-alert": { icon: ShieldAlert, tile: "bg-secondary text-muted-foreground" },
  package: { icon: Package, tile: "bg-secondary text-muted-foreground" },
  plane: { icon: Plane, tile: "bg-secondary text-muted-foreground" },
  "file-badge": { icon: FileBadge, tile: "bg-secondary text-muted-foreground" },
};

export function PackIcon({ name, className }: { name: string; className?: string }) {
  const entry = ICONS[name] ?? { icon: ListFilter, tile: "bg-secondary text-muted-foreground" };
  const Icon = entry.icon;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", entry.tile, className)}>
      <Icon className="size-4.5" aria-hidden />
    </span>
  );
}
