"use client";

import { ArrowRight, Eye, FlaskConical, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSendTestAlert } from "./test-alert-button";

const tile =
  "group flex h-full items-center gap-3 rounded-xl border bg-card p-4 text-left outline-none transition-colors hover:border-brand/60 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60";

function TileBody({ icon: Icon, title, hint, busy }: { icon: LucideIcon; title: string; hint: string; busy?: boolean }) {
  return (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-brand/30">
        {busy ? <Spinner className="size-5" /> : <Icon className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground text-pretty">{hint}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </>
  );
}

/** Three big, obvious next steps. */
export function QuickActions({ className }: { className?: string }) {
  const test = useSendTestAlert();
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-3", className)} aria-label="Quick actions">
      <li>
        <Link href="/mailboxes?add=1" className={tile}>
          <TileBody icon={Inbox} title="Add a mailbox" hint="Gmail, Outlook, Yahoo…" />
        </Link>
      </li>
      <li>
        <Link href="/rules" className={tile}>
          <TileBody icon={Eye} title="Choose what to watch" hint="Exams, jobs, bank…" />
        </Link>
      </li>
      <li>
        <button type="button" className={cn(tile, "w-full")} onClick={test.send} disabled={test.pending}>
          <TileBody icon={FlaskConical} title="Send me a test alert" hint="See what an alert looks like" busy={test.pending} />
        </button>
      </li>
    </ul>
  );
}
