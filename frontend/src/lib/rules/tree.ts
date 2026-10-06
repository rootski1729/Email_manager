import {
  HEADER_PREFIX,
  LIMITS,
  MULTI_VALUE_OPS,
  type ConditionJson,
  type Op,
  type PredicateJson,
} from "./types";

/** Editor model: every node has a stable id and its own NOT flag. */
export interface PredicateNode {
  kind: "predicate";
  id: string;
  negated: boolean;
  /** Field id from GET /rules/fields; for headers this is the literal "header:". */
  field: string;
  /** Header name when field === "header:". */
  header: string;
  op: Op;
  values: string[];
  pattern: string;
  flag: boolean;
  caseSensitive: boolean;
}

export interface GroupNode {
  kind: "group";
  id: string;
  negated: boolean;
  mode: "all" | "any";
  children: TreeNode[];
}

export type TreeNode = PredicateNode | GroupNode;

let seq = 0;
export function nodeId(): string {
  seq += 1;
  return `n${seq.toString(36)}`;
}

export function newPredicate(partial: Partial<PredicateNode> = {}): PredicateNode {
  return {
    kind: "predicate",
    id: nodeId(),
    negated: false,
    field: "subject",
    header: "",
    op: "contains",
    values: [],
    pattern: "",
    flag: true,
    caseSensitive: false,
    ...partial,
  };
}

export function newGroup(partial: Partial<GroupNode> = {}): GroupNode {
  return {
    kind: "group",
    id: nodeId(),
    negated: false,
    mode: "all",
    children: [newPredicate()],
    ...partial,
  };
}

export function defaultTree(): GroupNode {
  return newGroup({
    children: [newPredicate({ field: "from.domain", op: "domain_matches" })],
  });
}

/* ------------------------------------------------------------- JSON <-> tree */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function predicateFromJson(json: PredicateJson): PredicateNode {
  const isHeader = json.field.startsWith(HEADER_PREFIX);
  const value = json.value;
  const values = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string" && json.op !== "regex"
      ? [value]
      : [];
  return newPredicate({
    field: isHeader ? HEADER_PREFIX : json.field,
    header: isHeader ? json.field.slice(HEADER_PREFIX.length) : "",
    op: json.op,
    values,
    pattern: json.op === "regex" && typeof value === "string" ? value : "",
    flag: typeof value === "boolean" ? value : true,
    caseSensitive: Boolean(json.case_sensitive),
  });
}

export function fromJson(json: unknown): TreeNode {
  if (!isObject(json)) return newPredicate();
  if ("not" in json) {
    const inner = fromJson(json.not);
    return { ...inner, negated: !inner.negated };
  }
  if ("all" in json || "any" in json) {
    const mode = "all" in json ? "all" : "any";
    const list = (json[mode] as unknown[]) ?? [];
    return newGroup({ mode, children: Array.isArray(list) ? list.map(fromJson) : [] });
  }
  if (typeof json.field === "string" && typeof json.op === "string") {
    return predicateFromJson(json as unknown as PredicateJson);
  }
  return newPredicate();
}

/** The builder's root is always a group. */
export function rootFromJson(json: unknown): GroupNode {
  if (json == null || (isObject(json) && Object.keys(json).length === 0)) return defaultTree();
  const node = fromJson(json);
  return node.kind === "group" ? node : newGroup({ children: [node] });
}

export function predicateField(node: PredicateNode): string {
  return node.field === HEADER_PREFIX ? `${HEADER_PREFIX}${node.header.trim()}` : node.field;
}

function predicateToJson(node: PredicateNode): PredicateJson {
  const out: PredicateJson = { field: predicateField(node), op: node.op, case_sensitive: false };
  if (node.op === "exists") {
    // no value
  } else if (node.op === "is") {
    out.value = node.flag;
  } else if (node.op === "regex") {
    out.value = node.pattern;
  } else {
    const values = node.values.map((v) => v.trim()).filter(Boolean);
    out.value = values.length === 1 ? values[0] : values;
  }
  if (node.caseSensitive && node.op !== "exists" && node.op !== "is") out.case_sensitive = true;
  return out;
}

export function toJson(node: TreeNode): ConditionJson {
  const inner: ConditionJson =
    node.kind === "predicate"
      ? predicateToJson(node)
      : node.mode === "all"
        ? { all: node.children.map(toJson) }
        : { any: node.children.map(toJson) };
  return node.negated ? { not: inner } : inner;
}

/* --------------------------------------------------------------- tree edits */

export function updateNode(root: GroupNode, id: string, fn: (n: TreeNode) => TreeNode): GroupNode {
  const walk = (n: TreeNode): TreeNode => {
    if (n.id === id) return fn(n);
    if (n.kind === "group") return { ...n, children: n.children.map(walk) };
    return n;
  };
  return walk(root) as GroupNode;
}

export function removeNode(root: GroupNode, id: string): GroupNode {
  const walk = (n: GroupNode): GroupNode => ({
    ...n,
    children: n.children
      .filter((c) => c.id !== id)
      .map((c) => (c.kind === "group" ? walk(c) : c)),
  });
  return walk(root);
}

export function appendChild(root: GroupNode, groupId: string, child: TreeNode): GroupNode {
  return updateNode(root, groupId, (n) =>
    n.kind === "group" ? { ...n, children: [...n.children, child] } : n,
  );
}

/* ---------------------------------------------------------------- measuring */

/** Same algorithm as the backend: NOT wrappers count as a node and a level. */
export function measure(json: ConditionJson, depth = 1): { depth: number; nodes: number } {
  let children: ConditionJson[] = [];
  if ("all" in json) children = json.all;
  else if ("any" in json) children = json.any;
  else if ("not" in json) children = [json.not];
  else return { depth, nodes: 1 };
  let maxDepth = depth;
  let nodes = 1;
  for (const child of children) {
    const m = measure(child, depth + 1);
    maxDepth = Math.max(maxDepth, m.depth);
    nodes += m.nodes;
  }
  return { depth: maxDepth, nodes };
}

export function groupDepth(root: GroupNode, id: string): number {
  // Depth in JSON terms of a node (root = 1), counting NOT wrappers.
  const find = (n: TreeNode, d: number): number => {
    const here = d + (n.negated ? 1 : 0);
    if (n.id === id) return here;
    if (n.kind === "group") {
      for (const c of n.children) {
        const r = find(c, here + 1);
        if (r > 0) return r;
      }
    }
    return 0;
  };
  return find(root, 1);
}

/* --------------------------------------------------------------- validation */

export interface FieldSpec {
  field: string;
  label: string;
  ops: string[];
}

export type Issues = Record<string, string>;

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export function validateTree(root: GroupNode, fields: FieldSpec[]): { issues: Issues; global: string[] } {
  const issues: Issues = {};
  const global: string[] = [];
  const byField = new Map(fields.map((f) => [f.field, f]));

  const walk = (n: TreeNode) => {
    if (n.kind === "group") {
      if (n.children.length === 0) issues[n.id] = "Add at least one condition to this group.";
      n.children.forEach(walk);
      return;
    }
    const spec = byField.get(n.field);
    if (fields.length > 0 && !spec) {
      issues[n.id] = "Choose a field.";
      return;
    }
    if (n.field === HEADER_PREFIX && !HEADER_NAME.test(n.header.trim())) {
      issues[n.id] = "Enter a header name using letters, digits and dashes (e.g. X-Priority).";
      return;
    }
    if (spec && !spec.ops.includes(n.op)) {
      issues[n.id] = "Choose an operator for this field.";
      return;
    }
    if (MULTI_VALUE_OPS.includes(n.op)) {
      const values = n.values.map((v) => v.trim()).filter(Boolean);
      if (values.length === 0) issues[n.id] = "Add at least one value.";
      else if (values.length > LIMITS.maxValues) issues[n.id] = `At most ${LIMITS.maxValues} values per condition.`;
      else if (values.some((v) => v.length > LIMITS.maxValueLength))
        issues[n.id] = `Values are limited to ${LIMITS.maxValueLength} characters.`;
    } else if (n.op === "regex") {
      if (!n.pattern.trim()) issues[n.id] = "Enter a pattern.";
      else if (n.pattern.length > LIMITS.maxRegexLength)
        issues[n.id] = `Patterns are limited to ${LIMITS.maxRegexLength} characters.`;
    }
  };
  walk(root);

  const { depth, nodes } = measure(toJson(root));
  if (depth > LIMITS.maxDepth) global.push(`Conditions can be nested at most ${LIMITS.maxDepth} levels deep.`);
  if (nodes > LIMITS.maxNodes) global.push(`A rule can have at most ${LIMITS.maxNodes} conditions.`);
  return { issues, global };
}
