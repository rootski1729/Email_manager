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
import { GripVertical, ListFilter, Plus, Square } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { ListSkeleton } from "@/components/common/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { rulesQuery, useReorderRules, useUpdateRule } from "@/lib/api/queries";
import type { Rule } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { summarizeCondition } from "@/lib/rules/summary";
import type { ActionsJson } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

function RuleRow({ rule, index }: { rule: Rule; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  const update = useUpdateRule();
  const actions = (rule.actions ?? {}) as ActionsJson;
  const scope = rule.mailbox_ids?.length ? `${rule.mailbox_ids.length} mailbox${rule.mailbox_ids.length > 1 ? "es" : ""}` : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-stretch rounded-xl border bg-card transition-shadow",
        isDragging && "z-10 shadow-lg ring-2 ring-primary/30",
        !rule.enabled && "bg-muted/30",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        aria-label={`Reorder ${rule.name}. Press space to pick up, arrow keys to move.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-3 py-3 pr-4 pl-1 sm:flex-row sm:items-center">
        <Link
          href={`/rules/${rule.id}`}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground tabular">{index + 1}</span>
            <span className={cn("truncate font-medium", !rule.enabled && "text-muted-foreground")}>{rule.name}</span>
            {rule.stop_processing ? (
              <Badge variant="outline" className="gap-1">
                <Square className="size-2.5 fill-current" /> Stops
              </Badge>
            ) : null}
            {actions.notify?.mode === "digest" ? <Badge variant="secondary">Digest</Badge> : null}
            {scope ? <Badge variant="secondary">{scope}</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{summarizeCondition(rule.condition)}</p>
        </Link>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-left sm:text-right">
            <div className="text-sm font-medium tabular">{formatNumber(rule.match_count)} matches</div>
            <div className="text-xs text-muted-foreground">
              {rule.last_matched_at ? <RelativeTime iso={rule.last_matched_at} prefix="last" /> : "No matches yet"}
            </div>
          </div>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(v) => update.mutate({ id: rule.id, body: { enabled: v } })}
            aria-label={rule.enabled ? `Disable ${rule.name}` : `Enable ${rule.name}`}
          />
        </div>
      </div>
    </li>
  );
}

export function RulesList() {
  const rules = useQuery(rulesQuery);
  const reorder = useReorderRules();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const list = rules.data;
    if (!list || !e.over || e.active.id === e.over.id) return;
    const from = list.findIndex((r) => r.id === e.active.id);
    const to = list.findIndex((r) => r.id === e.over?.id);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(list, from, to).map((r) => r.id));
  }

  const newButton = (
    <Button asChild>
      <Link href="/rules/new">
        <Plus /> New rule
      </Link>
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Rules"
        description="Every new email runs through these rules from top to bottom. Every enabled rule that matches is recorded, unless one above it stops processing. Drag to change the order."
        actions={newButton}
      />
      {rules.isPending ? (
        <ListSkeleton rows={4} />
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title="Create your first rule"
          description="Rules decide which emails are important — for example, anything from univ.edu or its subdomains whose subject mentions an admit card or hall ticket."
        >
          {newButton}
        </EmptyState>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: "To reorder a rule, press space or enter to pick it up, use the arrow keys to move it, then press space or enter again to drop it. Press escape to cancel.",
            },
          }}
        >
          <SortableContext items={rules.data.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2" aria-label="Rules in evaluation order">
              {rules.data.map((r, i) => (
                <RuleRow key={r.id} rule={r} index={i} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
