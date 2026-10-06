import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Green tick / red cross with an accessible label. */
export function StatusIcon({ ok, className }: { ok: boolean; className?: string }) {
  return ok ? (
    <CheckCircle2 className={cn("size-4 shrink-0 text-success", className)} aria-label="OK" />
  ) : (
    <XCircle className={cn("size-4 shrink-0 text-destructive", className)} aria-label="Problem" />
  );
}
