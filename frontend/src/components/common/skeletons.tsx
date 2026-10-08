import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading placeholders shaped like the content they stand in for, so the page doesn't jump when data
 * arrives. Each top-level skeleton is announced once ("Loading…") and hidden from the accessibility tree
 * otherwise. Used by the views while their queries load and by the routes' loading.tsx files.
 */

function Busy({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">{label}…</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

export function HeaderSkeleton({ action = false, className }: { action?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 flex-1 space-y-3">
        <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      {action ? <Skeleton className="h-9 w-32 rounded-xl" /> : null}
    </div>
  );
}

/** One email row: avatar, sender and time, subject, and (in the full list) a summary line and chips. */
export function MailRowSkeleton({ detailed = false, className }: { detailed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 px-3 py-2.5", detailed && "px-4 py-3.5", className)}>
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
        <Skeleton className="h-4 w-4/5" />
        {detailed ? (
          <>
            <Skeleton className="h-3.5 w-11/12" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-10 rounded-md" />
              <Skeleton className="h-4 w-16 rounded-md" />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Rows for a card on Home ("Coming up"). */
export function MailRowsSkeleton({ rows = 3, square = false }: { rows?: number; square?: boolean }) {
  return (
    <Busy className="space-y-1 py-1">
      {Array.from({ length: rows }, (_, i) =>
        square ? (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ) : (
          <MailRowSkeleton key={i} />
        ),
      )}
    </Busy>
  );
}

/** The important-mail list: a day label and a card of rows. */
export function MailListSkeleton({ groups = [4, 2] }: { groups?: number[] }) {
  return (
    <Busy label="Loading your important mail" className="space-y-6">
      {groups.map((n, g) => (
        <div key={g}>
          <Skeleton className="mb-3 ml-1 h-3 w-20" />
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {Array.from({ length: n }, (_, i) => (
              <MailRowSkeleton key={i} detailed />
            ))}
          </div>
        </div>
      ))}
    </Busy>
  );
}

/** A generic list of cards (rules, deliveries, sent mail). */
export function CardListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Busy className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>
      ))}
    </Busy>
  );
}

/** A grid of tiles with an icon, title, two lines and a footer (topics, mailboxes). */
export function TileGridSkeleton({ count = 4, className, tall = false }: { count?: number; className?: string; tall?: boolean }) {
  return (
    <Busy className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", tall ? "min-h-44" : "min-h-32")}>
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>
          <Skeleton className="mt-auto h-3 w-12" />
        </div>
      ))}
    </Busy>
  );
}

/** A settings-style card: a title, a line, and a few label/control rows. */
export function FormCardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-4 rounded-2xl border bg-card p-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-t pt-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Upcoming: day headings with event cards. */
export function TimelineSkeleton() {
  return (
    <Busy label="Loading events" className="space-y-6">
      {[2, 1].map((n, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: n }, (_, j) => (
            <div key={j} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </Busy>
  );
}

/* ---------- whole pages (route loading.tsx and first loads) ---------- */

/** Home's four number cards: a round icon, a big number, a label and a change line. */
export function KpiRowSkeleton() {
  return (
    <Busy label="Loading your numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center sm:gap-4 sm:p-5"
        >
          <Skeleton className="size-11 shrink-0 rounded-full sm:size-14" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3.5 w-24 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
        </div>
      ))}
    </Busy>
  );
}

function ChartCardSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-48 max-w-full" />
      </div>
      {children}
    </div>
  );
}

/** Home's two rows of charts: three rings beside an area chart, then a line chart beside bars. */
export function ChartRowsSkeleton() {
  return (
    <Busy label="Loading charts" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-12">
        <ChartCardSkeleton className="xl:col-span-5">
          <div className="flex flex-1 items-center justify-between gap-2 sm:px-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-3">
                <Skeleton className="size-[5.5rem] rounded-full sm:size-28" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </ChartCardSkeleton>
        <ChartCardSkeleton className="xl:col-span-7">
          <Skeleton className="h-56 rounded-xl sm:h-60" />
        </ChartCardSkeleton>
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <ChartCardSkeleton className="xl:col-span-7">
          <Skeleton className="h-64 rounded-xl" />
        </ChartCardSkeleton>
        <ChartCardSkeleton className="xl:col-span-5">
          <div className="space-y-4 py-2">
            {[0.9, 0.7, 0.5, 0.35].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-5 rounded-md" style={{ width: `${w * 100}%` }} />
              </div>
            ))}
          </div>
        </ChartCardSkeleton>
      </div>
    </Busy>
  );
}

export function DashboardSkeleton() {
  return (
    <Busy label="Loading Home" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-[60px] w-full rounded-2xl sm:w-64" />
      </div>
      <Skeleton className="h-5 w-72 max-w-full rounded-md" />
      <KpiRowSkeleton />
      <Skeleton className="h-[88px] rounded-2xl" />
      <ChartRowsSkeleton />
    </Busy>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-8">
        <div className="min-w-0 space-y-5">
          <Skeleton className="h-10 w-full rounded-xl sm:max-w-sm" />
          <MailListSkeleton />
        </div>
        <Skeleton className="hidden h-52 rounded-2xl xl:block" />
      </div>
    </div>
  );
}

/** The email card on the message page: sender, summary box and the body. */
export function EmailCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      <Skeleton className="mt-5 h-20 rounded-xl" />
      <div className="mt-6 max-w-[70ch] space-y-3">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="h-2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <Busy label="Opening the email" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <EmailCardSkeleton />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </Busy>
  );
}

export function RulesSkeleton() {
  return (
    <div className="space-y-10">
      <HeaderSkeleton action />
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        <TileGridSkeleton count={6} />
      </div>
    </div>
  );
}

export function UpcomingSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton action />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <TimelineSkeleton />
        <div className="hidden space-y-6 lg:block" aria-hidden>
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <Busy label="Loading settings" className="mx-auto max-w-3xl space-y-10">
      <HeaderSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[74px] rounded-2xl" />
          <Skeleton className="h-[74px] rounded-2xl" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <FormCardSkeleton rows={4} />
      </div>
    </Busy>
  );
}

export function MailboxesSkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton action />
      <TileGridSkeleton count={2} tall className="gap-4 md:grid-cols-2" />
    </div>
  );
}
