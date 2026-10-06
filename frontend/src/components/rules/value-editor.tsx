"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { PredicateNode } from "@/lib/rules/tree";
import { LIMITS, MULTI_VALUE_OPS } from "@/lib/rules/types";
import { TagInput } from "./tag-input";

function placeholderFor(node: PredicateNode): string {
  if (node.op === "domain_matches") return "univ.edu, nta.ac.in";
  if (node.field.startsWith("from.address") || ["to", "cc", "recipients", "reply_to"].includes(node.field))
    return "name@example.com";
  if (node.field === "subject") return "admit card, hall ticket";
  if (node.field === "attachment.type") return "application/pdf";
  if (node.field === "attachment.name") return ".pdf, admit";
  return "Type a value and press Enter";
}

export function ValueEditor({
  node,
  onChange,
  invalid,
}: {
  node: PredicateNode;
  onChange: (patch: Partial<PredicateNode>) => void;
  invalid?: boolean;
}) {
  if (node.op === "exists") {
    return <div className="flex h-8 items-center px-1 text-sm whitespace-nowrap text-muted-foreground">No value needed</div>;
  }
  if (node.op === "is") {
    return (
      <label className="flex h-8 items-center gap-2 px-1 text-sm">
        <Switch checked={node.flag} onCheckedChange={(v) => onChange({ flag: v })} aria-label="Has attachment" />
        {node.flag ? "true — has at least one attachment" : "false — no attachments"}
      </label>
    );
  }
  if (node.op === "regex") {
    return (
      <Input
        value={node.pattern}
        onChange={(e) => onChange({ pattern: e.target.value })}
        placeholder="\b(mid|end)[- ]?sem\b"
        maxLength={LIMITS.maxRegexLength}
        className="font-mono text-[13px]"
        spellCheck={false}
        aria-label="Regular expression"
        aria-invalid={invalid || undefined}
      />
    );
  }
  if (MULTI_VALUE_OPS.includes(node.op)) {
    return (
      <TagInput
        values={node.values}
        onChange={(values) => onChange({ values })}
        placeholder={placeholderFor(node)}
        invalid={invalid}
        mono={node.op === "domain_matches"}
        max={LIMITS.maxValues}
        ariaLabel="Values"
      />
    );
  }
  return null;
}

