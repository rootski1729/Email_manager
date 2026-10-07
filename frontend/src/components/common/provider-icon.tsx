import { Mail, Server } from "lucide-react";

import type { Provider } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
  if (provider === "gmail") {
    return (
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/12 text-chart-5 ring-1 ring-inset ring-chart-5/25",
          className,
        )}
        aria-label="Gmail"
      >
        <Mail className="size-5" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-ink ring-1 ring-inset ring-brand/35",
        className,
      )}
      aria-label="Email account"
    >
      <Server className="size-5" />
    </span>
  );
}
