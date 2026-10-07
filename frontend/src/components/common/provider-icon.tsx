import { Mail, Server } from "lucide-react";

import type { Provider } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
  if (provider === "gmail") {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground",
          className,
        )}
        aria-label="Gmail"
      >
        <Mail className="size-4.5" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground",
        className,
      )}
      aria-label="Email account"
    >
      <Server className="size-4.5" />
    </span>
  );
}
