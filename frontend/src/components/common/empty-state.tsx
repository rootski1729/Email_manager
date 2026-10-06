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
    <Empty className={cn("rounded-2xl border border-dashed bg-card/60 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia>
          <div className="relative">
            <div aria-hidden className="absolute inset-0 -m-3 rounded-full bg-brand/25 blur-xl" />
            <div className="relative flex size-14 items-center justify-center rounded-2xl border bg-card text-brand-ink shadow-sm">
              <Icon className="size-6" />
            </div>
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-lg">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}
