"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { absoluteTime, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

export function RelativeTime({
  iso,
  className,
  fallback = "never",
  prefix,
}: {
  iso: string | null | undefined;
  className?: string;
  fallback?: string;
  prefix?: string;
}) {
  const now = useNow();
  if (!iso) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          className={cn("cursor-default underline-offset-4 decoration-dotted hover:underline", className)}
          suppressHydrationWarning
        >
          {prefix ? `${prefix} ` : ""}
          {relativeTime(iso, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{absoluteTime(iso)}</TooltipContent>
    </Tooltip>
  );
}
