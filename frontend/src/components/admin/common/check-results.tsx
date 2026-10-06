import type { CheckResult } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./status-icon";

/** A list of {ok, title, detail} results from a check or test. */
export function CheckResults({ results, className }: { results: CheckResult[]; className?: string }) {
  if (results.length === 0) return null;
  return (
    <ul className={cn("divide-y rounded-xl border bg-card", className)}>
      {results.map((r, i) => (
        <li key={`${r.title}-${i}`} className="flex items-start gap-3 px-4 py-3">
          <StatusIcon ok={r.ok} className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-sm break-words text-muted-foreground">{r.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
