"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Siren } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/errors";
import { rulePacksQuery, useInstallPack } from "@/lib/api/packs";
import { rulesQuery, useUpdateRule } from "@/lib/api/queries";
import type { Rule, RulePack } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PackIcon } from "./pack-icon";

function PackCard({ pack, rule }: { pack: RulePack; rule?: Rule }) {
  const install = useInstallPack();
  const update = useUpdateRule();
  const on = rule ? rule.enabled : pack.installed;
  const pending = install.isPending || update.isPending;
  const switchId = `pack-${pack.id}`;

  function toggle(next: boolean) {
    if (rule) {
      update.mutate(
        { id: rule.id, body: { enabled: next } },
        { onSuccess: () => toast.success(next ? `${pack.name} is on` : `${pack.name} is off`) },
      );
      return;
    }
    install.mutate(
      { id: pack.id },
      {
        onSuccess: () => toast.success(`${pack.name} is on`, { description: "We'll watch new email for this from now on." }),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <li
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow]",
        on ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "hover:border-brand/50",
      )}
    >
      <div className="flex items-start gap-3">
        <PackIcon name={pack.icon} className="size-11" />
        <div className="min-w-0 flex-1">
          <label htmlFor={switchId} className="flex flex-wrap items-center gap-1.5 font-medium">
            {pack.name}
            {pack.urgent ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                <Siren className="size-3" aria-hidden /> Urgent
              </span>
            ) : null}
          </label>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{pack.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {pending ? <Spinner className="text-muted-foreground" /> : null}
          <Switch id={switchId} checked={on} disabled={pending || (pack.installed && !rule)} onCheckedChange={toggle} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("font-medium", on ? "text-success" : "text-muted-foreground")}>{on ? "On" : "Off"}</span>
        {rule ? (
          <Link
            href={`/rules/${rule.id}`}
            className="inline-flex items-center gap-1 rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Pencil className="size-3" aria-hidden /> Adjust
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Ready-made topics as big on/off cards ("Exams & results — On"). */
export function StarterPacks() {
  const packs = useQuery(rulePacksQuery);
  const rules = useQuery(rulesQuery);
  const byPack = new Map<string, Rule>();
  for (const r of rules.data ?? []) {
    if (r.source?.startsWith("pack:")) byPack.set(r.source.slice(5), r);
  }

  if (packs.isPending || rules.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (packs.isError) {
    return <ErrorState error={packs.error} title="Couldn't load the ready-made topics" onRetry={() => void packs.refetch()} />;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {packs.data.map((p) => (
        <PackCard key={p.id} pack={p} rule={byPack.get(p.id)} />
      ))}
    </ul>
  );
}
