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
    <Empty className={cn("border border-dashed bg-card/40 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia>
          <div className="relative">
            <div aria-hidden className="absolute inset-0 -m-3 rounded-full bg-primary/10 blur-xl" />
            <div className="relative flex size-12 items-center justify-center rounded-xl border bg-card text-primary shadow-sm">
              <Icon className="size-5" />
            </div>
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}
