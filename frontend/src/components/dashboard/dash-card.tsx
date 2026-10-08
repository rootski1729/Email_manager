import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The dashboard's white card: a hairline, a whisper of shadow, a title row with an optional action. */
export function DashCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 animate-rise flex-col gap-4 rounded-2xl bg-card p-4 text-card-foreground shadow-xs ring-1 ring-border sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground text-pretty">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** What a chart shows before there's anything to draw: a soft icon and one friendly sentence. */
export function ChartEmpty({
  icon: Icon,
  title,
  text,
  tint = "bg-tint-iris text-tint-iris-ink",
  className,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 animate-rise flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center",
        className,
      )}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-full", tint)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground text-pretty">{text}</p>
    </div>
  );
}
