"use client";

import { CaseSensitive, FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { removeNode, updateNode, type PredicateNode, type TreeNode } from "@/lib/rules/tree";
import { HEADER_PREFIX, OP_HINTS, OP_LABELS, type Op } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { useBuilder } from "./builder-context";
import { ValueEditor } from "./value-editor";

export function NotToggle({ pressed, onChange, label }: { pressed: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          variant="outline"
          pressed={pressed}
          onPressedChange={onChange}
          aria-label={label}
          className="h-8 px-2 font-mono text-[11px] font-semibold tracking-wide data-[state=on]:border-destructive/40 data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive"
        >
          NOT
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{pressed ? "Negated — matches when this is false" : "Negate this"}</TooltipContent>
    </Tooltip>
  );
}

export function PredicateRow({ node, canDelete }: { node: PredicateNode; canDelete: boolean }) {
  const { setRoot, fields, issues, showIssues } = useBuilder();
  const spec = fields.find((f) => f.field === node.field);
  const ops = (spec?.ops ?? [node.op]) as Op[];
  const issue = showIssues ? issues[node.id] : undefined;
  const textual = node.op !== "exists" && node.op !== "is";

  const patch = (p: Partial<PredicateNode>) =>
    setRoot((root) => updateNode(root, node.id, (n) => ({ ...(n as PredicateNode), ...p }) as TreeNode));

  function changeField(field: string) {
    const next = fields.find((f) => f.field === field);
    const allowed = (next?.ops ?? []) as Op[];
    const op = allowed.includes(node.op) ? node.op : (allowed[0] ?? node.op);
    patch({ field, op });
  }

  return (
    <div
      className={cn(
        "@container rounded-lg border bg-background p-2 transition-colors",
        node.negated && "border-destructive/30 bg-destructive/[0.03]",
        issue && "border-destructive/50",
      )}
    >
      <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-start">
        <div className="flex min-w-0 flex-wrap items-center gap-2 @3xl:flex-nowrap">
          <NotToggle pressed={node.negated} onChange={(v) => patch({ negated: v })} label="Negate condition" />
          <Select value={node.field} onValueChange={changeField}>
            <SelectTrigger className="min-w-0 flex-1 basis-36 @3xl:w-48 @3xl:flex-none" aria-label="Field">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.field} value={f.field}>
                  <span className="truncate">{f.field === HEADER_PREFIX ? "Header…" : f.label}</span>
                  {f.needs_full_message ? <FileText className="ml-auto size-3 opacity-50" aria-label="Reads full message" /> : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {node.field === HEADER_PREFIX ? (
            <div className="flex min-w-0 flex-1 basis-40 items-center rounded-lg border border-input font-mono text-[13px] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 @3xl:w-44 @3xl:flex-none dark:bg-input/15">
              <span className="pl-2 text-muted-foreground select-none">header:</span>
              <Input
                value={node.header}
                onChange={(e) => patch({ header: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })}
                placeholder="X-Priority"
                maxLength={64}
                className="border-0 pl-0.5 font-mono text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
                aria-label="Header name"
                spellCheck={false}
              />
            </div>
          ) : null}
          <Select value={node.op} onValueChange={(v) => patch({ op: v as Op })}>
            <SelectTrigger className="min-w-0 flex-1 basis-32 @3xl:w-40 @3xl:flex-none" aria-label="Operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ops.map((op) => (
                <SelectItem key={op} value={op}>
                  {OP_LABELS[op] ?? op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div className="min-w-0 flex-1">
            <ValueEditor node={node} onChange={patch} invalid={Boolean(issue)} />
          </div>
          {textual ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  size="sm"
                  pressed={node.caseSensitive}
                  onPressedChange={(v) => patch({ caseSensitive: v })}
                  aria-label="Case sensitive"
                  className="h-8"
                >
                  <CaseSensitive />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>{node.caseSensitive ? "Case sensitive" : "Case insensitive (default)"}</TooltipContent>
            </Tooltip>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={!canDelete}
            onClick={() => setRoot((root) => removeNode(root, node.id))}
            aria-label="Remove condition"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {issue ? (
        <p className="mt-1.5 px-1 text-xs text-destructive" role="alert">
          {issue}
        </p>
      ) : OP_HINTS[node.op] && (node.op === "domain_matches" || node.op === "regex" || node.op === "contains_all") ? (
        <p className="mt-1.5 px-1 text-xs text-muted-foreground">{OP_HINTS[node.op]}</p>
      ) : null}
    </div>
  );
}
