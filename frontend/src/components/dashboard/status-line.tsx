"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { eventsQuery } from "@/lib/api/deadlines";
import { mailboxesQuery, overviewQuery } from "@/lib/api/queries";
import type { WahaHealth } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Issue {
  key: string;
  text: string;
  href?: string;
  action?: string;
  /** "fix" needs the user; "info" is just good to know. */
  kind: "fix" | "info";
}

/**
 * One friendly sentence about whether everything works, and a short list of
 * the things that need the user (with a button for each).
 */
export function StatusLine() {
  const overview = useQuery(overviewQuery);
  const mailboxes = useQuery(mailboxesQuery);
  const events = useQuery(eventsQuery());

  if (overview.isPending || mailboxes.isPending) return <Skeleton className="h-[76px] rounded-2xl" />;
  if (overview.isError || mailboxes.isError) return null;

  const o = overview.data;
  const boxes = mailboxes.data;
  const issues: Issue[] = [];

  if (boxes.length === 0) {
    issues.push({
      key: "no-mailbox",
      kind: "fix",
      text: "Add a mailbox so we can start watching your email.",
      href: "/mailboxes?add=1",
      action: "Add a mailbox",
    });
  }
  for (const m of boxes) {
    const name = m.display_name || m.address;
    if (m.status === "reauth_required") {
      issues.push({ key: m.id, kind: "fix", text: `${name} needs reconnecting.`, href: "/mailboxes", action: "Reconnect" });
    } else if (m.status === "error") {
      issues.push({ key: m.id, kind: "fix", text: `We're having trouble checking ${name}.`, href: "/mailboxes", action: "Take a look" });
    }
  }
  if (boxes.length > 0 && o.rules_enabled === 0) {
    issues.push({
      key: "no-rules",
      kind: "fix",
      text: "You're not watching for anything yet.",
      href: "/rules",
      action: "Choose what to watch",
    });
  }
  const waha = ((o.waha ?? {}) as WahaHealth).status?.toUpperCase();
  if (waha && waha !== "WORKING") {
    issues.push({
      key: "waha",
      kind: "info",
      text: "WhatsApp alerts are running late. We're already fixing it — nothing for you to do.",
    });
  }
  const toConfirm = (events.data ?? []).filter((e) => e.status === "suggested").length;
  if (toConfirm) {
    issues.push({
      key: "dates",
      kind: "info",
      text: toConfirm === 1 ? "We found a date in your email. Is it right?" : `We found ${toConfirm} dates in your email. Are they right?`,
      href: "/upcoming",
      action: "Check",
    });
  }

  const needsYou = issues.filter((i) => i.kind === "fix").length;
  const active = boxes.filter((m) => m.status === "active").length;
  const allGood = needsYou === 0 && !issues.some((i) => i.key === "waha");

  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        allGood ? "border-success/25 bg-success/8" : needsYou ? "border-warning/30 bg-warning/8" : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            allGood ? "bg-success text-success-foreground" : needsYou ? "bg-warning text-warning-foreground" : "bg-info text-info-foreground",
          )}
          aria-hidden
        >
          {allGood ? <CheckCircle2 className="size-5" /> : needsYou ? <AlertTriangle className="size-5" /> : <Info className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight sm:text-lg">
            {allGood
              ? "All good — WhatsApp alerts are on"
              : needsYou
                ? needsYou === 1
                  ? "1 thing needs your attention"
                  : `${needsYou} things need your attention`
                : "Almost all good"}
          </p>
          {allGood ? (
            <p className="text-sm text-muted-foreground">
              Watching {active} {active === 1 ? "mailbox" : "mailboxes"} for {o.rules_enabled}{" "}
              {o.rules_enabled === 1 ? "kind" : "kinds"} of important email.
            </p>
          ) : null}
        </div>
      </div>
      {issues.length ? (
        <ul className="mt-3 space-y-2 sm:pl-13">
          {issues.map((i) => (
            <li
              key={i.key}
              className="flex flex-col gap-2 rounded-xl bg-card/80 px-3 py-2.5 text-sm ring-1 ring-border sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-pretty">{i.text}</span>
              {i.href && i.action ? (
                <Link
                  href={i.href}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-md font-medium text-brand-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-auto"
                >
                  {i.action} <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
