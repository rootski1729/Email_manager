import { cn } from "@/lib/utils";
import { TONE_CLASSES, type Tone } from "@/lib/status";

export function StatusBadge({
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
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        t.badge,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-ping-soft text-current")}
      />
      {children}
    </span>
  );
}
