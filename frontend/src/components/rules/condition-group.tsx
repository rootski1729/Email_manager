"use client";

import { FolderPlus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  appendChild,
  newGroup,
  newPredicate,
  removeNode,
  updateNode,
  type GroupNode,
  type TreeNode,
} from "@/lib/rules/tree";
import { LIMITS } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { useBuilder } from "./builder-context";
import { NotToggle, PredicateRow } from "./predicate-row";

/** depth is in JSON levels (root = 1), counting NOT wrappers like the backend. */
export function ConditionGroup({ node, depth, isRoot = false }: { node: GroupNode; depth: number; isRoot?: boolean }) {
  const { setRoot, issues, showIssues, nodeCount } = useBuilder();
  const ownDepth = depth + (node.negated ? 1 : 0);
  const atNodeLimit = nodeCount >= LIMITS.maxNodes;
  // A nested group adds one level and its first predicate another.
  const canNest = ownDepth + 2 <= LIMITS.maxDepth && nodeCount + 2 <= LIMITS.maxNodes;
  const issue = showIssues ? issues[node.id] : undefined;
  const joiner = node.mode === "all" ? "and" : "or";

  const patch = (p: Partial<GroupNode>) =>
    setRoot((root) => updateNode(root, node.id, (n) => ({ ...(n as GroupNode), ...p }) as TreeNode));

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        isRoot ? "bg-muted/30" : "bg-card",
        node.negated && "border-rose-500/30",
        issue && "border-destructive/50",
      )}
      role="group"
      aria-label={isRoot ? "Conditions" : "Condition group"}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NotToggle pressed={node.negated} onChange={(v) => patch({ negated: v })} label="Negate group" />
        <span className="text-sm text-muted-foreground">Match</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={node.mode}
          onValueChange={(v) => v && patch({ mode: v as "all" | "any" })}
          aria-label="Group logic"
        >
          <ToggleGroupItem value="all" className="px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
            ALL
          </ToggleGroupItem>
          <ToggleGroupItem value="any" className="px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
            ANY
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">of the following</span>
        {!isRoot ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={() => setRoot((root) => removeNode(root, node.id))}
            aria-label="Remove group"
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <div className="space-y-0">
        {node.children.map((child, i) => (
          <div key={child.id}>
            {i > 0 ? (
              <div className="flex items-center gap-2 py-1 pl-3" aria-hidden>
                <span className="h-3 border-l border-dashed" />
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {joiner}
                </span>
              </div>
            ) : null}
            {child.kind === "group" ? (
              <ConditionGroup node={child} depth={ownDepth + 1} />
            ) : (
              <PredicateRow node={child} canDelete={!isRoot || node.children.length > 1} />
            )}
          </div>
        ))}
      </div>

      {issue ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {issue}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atNodeLimit}
          onClick={() => setRoot((root) => appendChild(root, node.id, newPredicate()))}
        >
          <Plus /> Condition
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canNest}
          title={!canNest ? `Rules can nest at most ${LIMITS.maxDepth} levels and ${LIMITS.maxNodes} conditions` : undefined}
          onClick={() =>
            setRoot((root) =>
              appendChild(root, node.id, newGroup({ mode: node.mode === "all" ? "any" : "all" })),
            )
          }
        >
          <FolderPlus /> Group
        </Button>
      </div>
    </div>
  );
}
