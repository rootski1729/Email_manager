import type { LucideIcon } from "lucide-react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("rounded-xl border border-dashed bg-card/60 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia>
          <div className="flex size-14 items-center justify-center rounded-xl border bg-card text-brand-ink">
            <Icon className="size-6" />
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-lg">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}
