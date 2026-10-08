import { CardListSkeleton } from "@/components/common/skeletons";
import { cn } from "@/lib/utils";

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular">{children}</dd>
    </div>
  );
}

/** A list of cards while it loads (shaped like a row with an icon, two lines and a switch). */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return <CardListSkeleton rows={rows} className={className} />;
}
