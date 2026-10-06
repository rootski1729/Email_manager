import { Mail, Server } from "lucide-react";

import type { Provider } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
  if (provider === "gmail") {
    return (
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300",
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
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/20 dark:text-sky-300",
        className,
      )}
      aria-label="IMAP"
    >
      <Server className="size-5" />
    </span>
  );
}
