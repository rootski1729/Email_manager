"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarClock, Search, Settings, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Brand } from "@/components/common/brand";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { eventsQuery } from "@/lib/api/deadlines";
import { overviewQuery } from "@/lib/api/queries";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { ConnectionIndicator } from "./connection-indicator";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const DAY_MS = 86_400_000;

/** Each tile gets its own soft hue; the badge is the same hue's ink, so it reads as part of the tile. */
const TILE = {
  amber: { tile: "bg-tint-amber text-tint-amber-ink", badge: "bg-tint-amber-ink text-tint-amber" },
  green: { tile: "bg-tint-green text-tint-green-ink", badge: "bg-destructive text-destructive-foreground" },
  sky: { tile: "bg-tint-sky text-tint-sky-ink", badge: "bg-tint-sky-ink text-tint-sky" },
} as const;

function IconTile({
  href,
  icon: Icon,
  label,
  tint,
  count = 0,
  countLabel,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tint: keyof typeof TILE;
  count?: number;
  countLabel?: string;
  className?: string;
}) {
  const t = TILE[tint];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={count && countLabel ? `${label}: ${countLabel}` : label}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-xl outline-none transition-[transform,filter] duration-200 ease-(--ease-soft) hover:brightness-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 md:size-10 dark:hover:brightness-125",
            t.tile,
            className,
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
          {count > 0 ? (
            <span
              aria-hidden
              className={cn(
                "absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular ring-2 ring-background",
                t.badge,
              )}
            >
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent>{count && countLabel ? countLabel : label}</TooltipContent>
    </Tooltip>
  );
}

/** "Search your mail…": takes you to Important mail with the search filled in. */
function SearchForm({
  autoFocus,
  onDone,
  className,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // On the mail list the page has its own search box; here we start from whatever it's searching for.
  const [q, setQ] = useState(pathname === "/messages" ? (params.get("q") ?? "") : "");
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/messages?q=${encodeURIComponent(term.slice(0, 200))}` : "/messages");
        onDone?.();
      }}
    >
      <InputGroup className="h-10 rounded-xl border-transparent bg-card shadow-xs ring-1 ring-border hover:ring-(--lift-border) dark:bg-card">
        <InputGroupAddon className="pl-3.5">
          <Search className="size-4 text-muted-foreground" aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone?.();
          }}
          placeholder="Search your mail…"
          aria-label="Search your mail"
          autoFocus={autoFocus}
          maxLength={200}
          className="[&::-webkit-search-cancel-button]:hidden"
        />
      </InputGroup>
    </form>
  );
}

function useBadges() {
  const now = useNow();
  const events = useQuery(eventsQuery());
  const overview = useQuery(overviewQuery);
  const upcoming = now
    ? (events.data ?? []).filter((e) => {
        if (e.status !== "upcoming" && e.status !== "suggested") return false;
        const t = new Date(e.starts_at).getTime();
        return t >= now && t <= now + 30 * DAY_MS;
      }).length
    : 0;
  const n24 = overview.data?.notifications_24h ?? {};
  const failed = (n24.failed ?? 0) + (n24.dead ?? 0);
  return { upcoming, failed };
}

/**
 * The app's top bar: search, coloured shortcut tiles with counts, and "Hello, name" with the account menu.
 * On phones it folds down to the brand, a search button and the essentials.
 */
export function TopBar({ className }: { className?: string }) {
  const [searching, setSearching] = useState(false);
  const { upcoming, failed } = useBadges();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md md:h-16 md:gap-3 md:px-6",
        className,
      )}
    >
      <SidebarTrigger className="hidden md:inline-flex" />
      <Link
        href="/dashboard"
        aria-label="Home"
        className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring md:hidden"
      >
        <Brand />
      </Link>
      <Suspense fallback={<div className="hidden h-10 max-w-md flex-1 md:block" />}>
        <SearchForm className="hidden max-w-md flex-1 md:block" />
      </Suspense>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2.5">
        <ConnectionIndicator />
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Search your mail"
          onClick={() => setSearching(true)}
        >
          <Search />
        </Button>
        <IconTile
          href="/upcoming"
          icon={CalendarClock}
          label="Upcoming"
          tint="amber"
          count={upcoming}
          countLabel={upcoming === 1 ? "1 date in the next 30 days" : `${upcoming} dates in the next 30 days`}
        />
        <IconTile
          href="/deliveries"
          icon={BellRing}
          label="WhatsApp activity"
          tint="green"
          count={failed}
          countLabel={failed === 1 ? "1 WhatsApp message failed today" : `${failed} WhatsApp messages failed today`}
          className="hidden sm:flex"
        />
        <IconTile href="/settings" icon={Settings} label="Settings" tint="sky" className="hidden sm:flex" />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 hidden lg:block data-vertical:h-7 data-vertical:self-center" />
        <UserMenu greeting />
      </div>

      {searching ? (
        <div className="absolute inset-0 z-10 flex animate-in items-center gap-2 bg-background px-3 fade-in md:hidden">
          <Suspense>
            <SearchForm autoFocus onDone={() => setSearching(false)} className="min-w-0 flex-1" />
          </Suspense>
          <Button variant="ghost" size="icon" aria-label="Close search" onClick={() => setSearching(false)}>
            <X />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
