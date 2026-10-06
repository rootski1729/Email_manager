import type { Tone } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

export const TONE: Record<Tone, { badge: string; dot: string; text: string; soft: string }> = {
  success: {
    badge: "bg-success/10 text-success ring-success/25",
    dot: "bg-success",
    text: "text-success",
    soft: "bg-success/10",
  },
  warning: {
    badge: "bg-warning/15 text-foreground ring-warning/40",
    dot: "bg-warning",
    text: "text-warning-foreground dark:text-warning",
    soft: "bg-warning/15",
  },
  danger: {
    badge: "bg-destructive/10 text-destructive ring-destructive/25",
    dot: "bg-destructive",
    text: "text-destructive",
    soft: "bg-destructive/10",
  },
  info: {
    badge: "bg-info/10 text-info ring-info/25",
    dot: "bg-info",
    text: "text-info",
    soft: "bg-info/10",
  },
  brand: {
    badge: "bg-primary/10 text-primary ring-primary/20",
    dot: "bg-primary",
    text: "text-primary",
    soft: "bg-primary/10",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    soft: "bg-muted",
  },
};

export function ToneBadge({
  tone,
  children,
  pulse = false,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        t.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-ping-soft text-current")} />
      {children}
    </span>
  );
}
