import { initials } from "@/lib/format";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";

/** A sender's initials on their own soft colour (decorative: the name is always shown beside it). */
export function SenderAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide select-none",
        tintFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
