"use client";

import { ArrowRight, Eye, FlaskConical, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSendTestAlert } from "./test-alert-button";

const tile =
  "lift group flex h-full items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/** Each action gets its own soft hue (tokens `--tint-*`), so the three read as distinct at a glance. */
const CHIP = {
  iris: "bg-tint-iris text-tint-iris-ink",
  teal: "bg-tint-teal text-tint-teal-ink",
  amber: "bg-tint-amber text-tint-amber-ink",
} as const;

function TileBody({
  icon: Icon,
  title,
  hint,
  busy,
  tint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  busy?: boolean;
  tint: keyof typeof CHIP;
}) {
  return (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 ease-(--ease-soft) group-hover:scale-105 motion-reduce:group-hover:scale-100",
          CHIP[tint],
        )}
      >
        {busy ? <Spinner className="size-[18px]" /> : <Icon className="size-[18px]" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground text-pretty">{hint}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </>
  );
}

/** Three big, obvious next steps. */
export function QuickActions({ className }: { className?: string }) {
  const test = useSendTestAlert();
  return (
    <ul className={cn("stagger grid gap-3 sm:grid-cols-3", className)} aria-label="Quick actions">
      <li>
        <Link href="/mailboxes?add=1" className={tile}>
          <TileBody icon={Inbox} tint="iris" title="Add a mailbox" hint="Gmail, Outlook, Yahoo…" />
        </Link>
      </li>
      <li>
        <Link href="/rules" className={tile}>
          <TileBody icon={Eye} tint="teal" title="Choose what to watch" hint="Exams, jobs, bank…" />
        </Link>
      </li>
      <li>
        <button type="button" className={cn(tile, "w-full")} onClick={test.send} disabled={test.pending}>
          <TileBody icon={FlaskConical} tint="amber" title="Send me a test alert" hint="See what an alert looks like" busy={test.pending} />
        </button>
      </li>
    </ul>
  );
}
