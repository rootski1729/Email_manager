import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import type { Tone } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";
import { TONE } from "./tone-badge";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className={cn("size-4 shrink-0", tone === "danger" ? TONE[tone].text : "text-muted-foreground")} aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const cls =
    "block rounded-xl border bg-card p-4 text-card-foreground transition-colors sm:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "outline-none hover:border-input focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
