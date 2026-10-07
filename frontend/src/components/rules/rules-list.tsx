"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Check, GripVertical, Plus, Siren } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ErrorState } from "@/components/common/error-state";
import { PageHeader, Section } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { rulesQuery, useReorderRules, useUpdateRule } from "@/lib/api/queries";
import type { Rule } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { plainSummary } from "@/lib/rules/summary";
import type { ActionsJson } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { StarterPacks } from "./starter-packs";
import { SuggestionsPanel } from "./suggestions-panel";

function RuleCard({ rule }: { rule: Rule }) {
  const update = useUpdateRule();
  const actions = (rule.actions ?? {}) as ActionsJson;
  const urgent = Boolean(actions.notify?.urgent);
  const digest = actions.notify?.mode === "digest" && !urgent;

  return (
    <li
      className={cn(
        "relative flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-input has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring",
        !rule.enabled && "bg-muted/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/rules/${rule.id}`}
            className={cn(
              "truncate font-medium outline-none after:absolute after:inset-0 after:rounded-xl",
              !rule.enabled && "text-muted-foreground",
            )}
          >
            {rule.name}
          </Link>
          {urgent ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <Siren className="size-3" aria-hidden /> Urgent
            </span>
          ) : null}
          {digest ? (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              Daily summary
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Alert me when an email is {plainSummary(rule.condition)}.
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {rule.match_count ? (
            <>
              Caught {pluralize(rule.match_count, "email")} · last <RelativeTime iso={rule.last_matched_at} />
            </>
          ) : (
            "Hasn't caught anything yet"
          )}
        </p>
      </div>
      <Switch
        className="relative z-10 mt-0.5"
        checked={rule.enabled}
        onCheckedChange={(v) => update.mutate({ id: rule.id, body: { enabled: v } })}
        aria-label={rule.enabled ? `Turn off ${rule.name}` : `Turn on ${rule.name}`}
      />
    </li>
  );
}

function SortableRow({ rule, index }: { rule: Rule; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card py-2 pr-4 pl-1",
        isDragging && "z-10 shadow-lg ring-2 ring-primary/50",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={`Move ${rule.name}. Press space to pick up, arrow keys to move.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right font-mono text-xs text-muted-foreground tabular">{index + 1}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !rule.enabled && "text-muted-foreground")}>
        {rule.name}
      </span>
      {rule.stop_processing ? <span className="shrink-0 text-xs text-muted-foreground">stops here</span> : null}
    </li>
  );
}

function ReorderList({ rules }: { rules: Rule[] }) {
  const reorder = useReorderRules();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rules.findIndex((r) => r.id === e.active.id);
    const to = rules.findIndex((r) => r.id === e.over?.id);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(rules, from, to).map((r) => r.id));
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To move a rule, press space or enter to pick it up, use the arrow keys to move it, then press space or enter again to drop it. Press escape to cancel.",
        },
      }}
    >
      <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2" aria-label="Rules in the order they are checked">
          {rules.map((r, i) => (
            <SortableRow key={r.id} rule={r} index={i} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

export function RulesList() {
  const rules = useQuery(rulesQuery);
  const [reordering, setReordering] = useState(false);
  const custom = (rules.data ?? []).filter((r) => !r.source?.startsWith("pack:"));

  const newButton = (
    <Button asChild>
      <Link href="/rules/new">
        <Plus /> Add your own
      </Link>
    </Button>
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="What to watch"
        description="Pick the kinds of email that matter to you. When one arrives, we send it to your WhatsApp."
        actions={newButton}
        className="pb-0"
      />

      <Section
        id="topics"
        title="Ready-made topics"
        description="Switch on the ones you care about. You can fine-tune any of them later."
      >
        <StarterPacks />
      </Section>

      <SuggestionsPanel />

      <Section
        id="mine"
        title="My own rules"
        description="Watch for specific senders or words."
        action={
          rules.data && rules.data.length > 1 ? (
            <Button variant="ghost" size="sm" onClick={() => setReordering((r) => !r)} aria-pressed={reordering}>
              {reordering ? <Check /> : <ArrowUpDown />} {reordering ? "Done" : "Change order"}
            </Button>
          ) : null
        }
      >
        {rules.isPending ? (
          <ListSkeleton rows={3} />
        ) : rules.isError ? (
          <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
        ) : reordering ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">
              Every rule is checked, top to bottom. Order only matters for rules set to &ldquo;Stop here&rdquo;. Drag to
              move.
            </p>
            <ReorderList rules={rules.data} />
          </div>
        ) : custom.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground text-pretty">
              Nothing yet. For example: anything from <span className="font-medium text-foreground">univ.edu</span> whose
              subject mentions <span className="font-medium text-foreground">admit card</span>.
            </p>
            {newButton}
          </div>
        ) : (
          <ul className="space-y-3">
            {custom.map((r) => (
              <RuleCard key={r.id} rule={r} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
