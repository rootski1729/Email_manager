/**
 * Plain-English summary of a rule condition (the JSON stored on a rule):
 * `{all: [...]}`, `{any: [...]}`, `{not: ...}` and predicates `{field, op, value}`.
 */

const FIELDS: Record<string, string> = {
  "from.address": "sender",
  "from.name": "sender name",
  "from.domain": "sender domain",
  to: "To",
  cc: "Cc",
  recipients: "To or Cc",
  reply_to: "Reply-To",
  subject: "subject",
  body: "body",
  anywhere: "the email",
  list_id: "mailing list",
  "attachment.name": "attachment name",
  "attachment.type": "attachment type",
  has_attachment: "attachment",
  mailbox: "mailbox",
};

const OPS: Record<string, string> = {
  equals: "is",
  contains: "contains",
  contains_all: "contains all of",
  starts_with: "starts with",
  ends_with: "ends with",
  regex: "matches",
  domain_matches: "is from",
};

const NOT_OPS: Record<string, string> = {
  equals: "is not",
  contains: "doesn't contain",
  contains_all: "doesn't contain all of",
  starts_with: "doesn't start with",
  ends_with: "doesn't end with",
  domain_matches: "is not from",
};

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function fieldWords(field: string): string {
  if (field.startsWith("header:")) return `the ${field.slice(7) || "?"} header`;
  return FIELDS[field] ?? field;
}

function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return [String(value)];
}

function quoteList(list: string[], joiner: string, max = 3): string {
  const shown = list.slice(0, max).map((v) => `“${v}”`);
  const more = list.length > max ? ` (+${list.length - max} more)` : "";
  if (shown.length <= 1) return (shown[0] ?? "“”") + more;
  return `${shown.slice(0, -1).join(", ")} ${joiner} ${shown[shown.length - 1]}${more}`;
}

function predicate(p: Json, negated: boolean): string {
  const field = String(p.field ?? "?");
  const op = String(p.op ?? "?");
  const name = fieldWords(field);
  if (op === "is" || field === "has_attachment") {
    return Boolean(p.value) !== negated ? "has an attachment" : "has no attachment";
  }
  if (op === "exists") return `${name} ${negated ? "is missing" : "is present"}`;
  if (op === "regex") return `${name} ${negated ? "doesn't match" : "matches"} the pattern /${String(p.value ?? "")}/`;
  const list = values(p.value);
  const verb = negated ? (NOT_OPS[op] ?? `not ${op}`) : (OPS[op] ?? op);
  return `${name} ${verb} ${quoteList(list, op === "contains_all" ? "and" : "or")}`;
}

/** Human-readable one-liner for a condition tree, e.g. `subject contains “exam” or “result”, and sender is not …`. */
export function summarizeCondition(node: unknown, depth = 0): string {
  if (!isObject(node)) return "No conditions";
  if ("not" in node) {
    const inner = node.not;
    if (isObject(inner) && "field" in inner) return predicate(inner, true);
    return `not (${summarizeCondition(inner, depth + 1)})`;
  }
  const group = Array.isArray(node.all) ? { list: node.all, joiner: "and" } : Array.isArray(node.any) ? { list: node.any, joiner: "or" } : null;
  if (group) {
    if (group.list.length === 0) return "No conditions";
    if (group.list.length === 1) return summarizeCondition(group.list[0], depth);
    const parts = group.list.map((c) => summarizeCondition(c, depth + 1));
    const text = parts.join(group.joiner === "and" ? "; and " : "; or ");
    return depth > 0 ? `(${text})` : text;
  }
  if ("field" in node) return predicate(node, false);
  return "No conditions";
}

/** Count leaf predicates (for "3 conditions" labels). */
export function countPredicates(node: unknown): number {
  if (!isObject(node)) return 0;
  if ("not" in node) return countPredicates(node.not);
  const list = Array.isArray(node.all) ? node.all : Array.isArray(node.any) ? node.any : null;
  if (list) return list.reduce<number>((n, c) => n + countPredicates(c), 0);
  return "field" in node ? 1 : 0;
}
