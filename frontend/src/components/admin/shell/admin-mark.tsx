import { ShieldCheck } from "lucide-react";

import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/** The admin console's brand: a shield tile in the sidebar's accent colour. */
export function AdminMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground",
        className,
      )}
    >
      <ShieldCheck className="size-4.5" aria-hidden />
    </span>
  );
}

export function AdminBrand() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AdminMark />
      <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">Admin console</span>
      </span>
    </span>
  );
}
