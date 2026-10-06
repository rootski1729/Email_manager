"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { onboardingQuery, useDismissOnboarding } from "@/lib/api/assist";
import type { OnboardingStep } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { TestAlertButton } from "./test-alert-button";

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-sidebar-accent"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={`${value} of ${total} steps done`}
    >
      <div className="h-full rounded-full bg-sidebar-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Step({ step, index, isNext }: { step: OnboardingStep; index: number; isNext: boolean }) {
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl p-3 transition-colors",
        isNext ? "bg-card text-card-foreground shadow-sm" : "text-sidebar-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          step.done
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : isNext
              ? "bg-primary text-primary-foreground"
              : "ring-1 ring-sidebar-foreground/30 ring-inset",
        )}
        aria-hidden
      >
        {step.done ? <Check className="size-3.5" /> : index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className={cn("text-sm font-medium", step.done && "opacity-60")}>
            {step.title}
            <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
          </h3>
          {isNext ? <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{step.description}</p> : null}
        </div>
        {!isNext ? null : step.id === "test" ? (
          <TestAlertButton variant="default" />
        ) : step.href && step.href !== "/dashboard" ? (
          <Button asChild size="sm">
            <Link href={step.href}>
              Let&apos;s do it <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Getting-started checklist from GET /me/onboarding; hidden once dismissed or complete. */
export function Onboarding() {
  const q = useQuery(onboardingQuery);
  const dismiss = useDismissOnboarding();
  const o = q.data;
  if (!o || o.dismissed || o.completed >= o.total) return null;
  const next = o.steps.findIndex((s) => !s.done);
  const left = o.total - o.completed;

  return (
    <section
      aria-labelledby="onboarding-title"
      className="relative overflow-hidden rounded-2xl bg-sidebar p-4 text-sidebar-foreground sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-sidebar-primary/20 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="onboarding-title" className="text-lg font-semibold tracking-tight text-sidebar-accent-foreground">
              Let&apos;s get you set up
            </h2>
            <p className="text-sm text-sidebar-foreground/75">
              {left === 1 ? "Just one step left" : `${left} quick steps left`}, then important email reaches your WhatsApp
              on its own.
            </p>
          </div>
          <ProgressBar value={o.completed} total={o.total} />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide the setup checklist"
          className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
        >
          <X />
        </Button>
      </div>
      <ol className="relative mt-4 grid gap-1 md:grid-cols-2">
        {o.steps.map((s, i) => (
          <Step key={s.id} step={s} index={i} isNext={i === next} />
        ))}
      </ol>
    </section>
  );
}
