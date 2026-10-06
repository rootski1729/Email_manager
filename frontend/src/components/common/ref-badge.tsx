import { Hash } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The short WhatsApp code of a matched email, e.g. #K7 for "/open K7". */
export function RefBadge({ value, className, hint = true }: { value: string | null | undefined; className?: string; hint?: boolean }) {
  if (!value) return null;
  const badge = (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md bg-brand/20 px-1.5 font-mono text-[11px] font-semibold text-brand-ink tabular ring-1 ring-brand/35 ring-inset",
        className,
      )}
    >
      <Hash className="size-3" aria-hidden />
      <span className="sr-only">WhatsApp code </span>
      {value}
    </span>
  );
  if (!hint) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="relative z-10 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Its WhatsApp code. Send /open {value}, /remind {value} 2h or /mute {value} to the bot.
      </TooltipContent>
    </Tooltip>
  );
}
