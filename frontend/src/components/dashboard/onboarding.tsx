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
      className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={`${value} of ${total} steps done`}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Step({ step, index, isNext }: { step: OnboardingStep; index: number; isNext: boolean }) {
  return (
    <li className="flex break-inside-avoid gap-3 py-2">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          step.done
            ? "bg-accent text-brand-ink"
            : isNext
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground ring-1 ring-border ring-inset",
        )}
        aria-hidden
      >
        {step.done ? <Check className="size-3.5" /> : index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        <div>
          <h3 className={cn("text-sm font-medium", step.done && "text-muted-foreground")}>
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
      className="animate-rise rounded-2xl bg-card px-4 py-4 text-card-foreground shadow-xs ring-1 ring-border sm:px-5 sm:py-5"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="onboarding-title" className="text-base font-semibold tracking-tight">
              Let&apos;s get you set up
            </h2>
            <p className="text-sm text-muted-foreground">
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
          className="shrink-0 text-muted-foreground"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
        >
          <X />
        </Button>
      </div>
      <ol className="mt-3 gap-x-10 md:columns-2">
        {o.steps.map((s, i) => (
          <Step key={s.id} step={s} index={i} isNext={i === next} />
        ))}
      </ol>
    </section>
  );
}
