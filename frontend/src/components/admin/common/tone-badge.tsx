import type { Tone } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

export const TONE: Record<Tone, { badge: string; dot: string; text: string; soft: string }> = {
  success: {
    badge: "bg-success/10 text-success",
    dot: "bg-success",
    text: "text-success",
    soft: "bg-success/10",
  },
  warning: {
    badge: "bg-warning/10 text-warning",
    dot: "bg-warning",
    text: "text-warning",
    soft: "bg-warning/15",
  },
  danger: {
    badge: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    soft: "bg-destructive/10",
  },
  info: {
    badge: "bg-info/10 text-info",
    dot: "bg-info",
    text: "text-info",
    soft: "bg-info/10",
  },
  brand: {
    badge: "bg-accent text-brand-ink",
    dot: "bg-brand",
    text: "text-brand-ink",
    soft: "bg-accent",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground",
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
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        t.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-ping-soft text-current")} />
      {children}
    </span>
  );
}
