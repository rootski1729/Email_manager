import { HEADER_PREFIX, OP_LABELS, type ConditionJson, type PredicateJson } from "./types";

const SHORT_FIELD: Record<string, string> = {
  "from.address": "sender",
  "from.name": "sender name",
  "from.domain": "sender domain",
  to: "To",
  cc: "Cc",
  recipients: "To/Cc",
  reply_to: "Reply-To",
  subject: "subject",
  body: "body",
  anywhere: "anywhere",
  list_id: "mailing list",
  "attachment.name": "attachment name",
  "attachment.type": "attachment type",
  has_attachment: "attachment",
  mailbox: "mailbox",
};

export function fieldLabel(field: string): string {
  if (field.startsWith(HEADER_PREFIX)) return `${field.slice(HEADER_PREFIX.length) || "header"} header`;
  return SHORT_FIELD[field] ?? field;
}

function quote(v: string) {
  return `“${v}”`;
}

export function summarizePredicate(p: PredicateJson, negated = false): string {
  const field = fieldLabel(p.field);
  if (p.op === "is") {
    const has = Boolean(p.value) !== negated;
    return has ? "has an attachment" : "has no attachment";
  }
  if (p.op === "exists") return `${field} ${negated ? "is missing" : "exists"}`;
  const op = OP_LABELS[p.op] ?? p.op;
  let value: string;
  if (p.op === "regex") value = `/${String(p.value ?? "")}/`;
  else {
    const list = Array.isArray(p.value) ? p.value : p.value == null ? [] : [String(p.value)];
    const shown = list.slice(0, 3).map(quote);
    const more = list.length > 3 ? ` +${list.length - 3}` : "";
    value = shown.join(p.op === "contains_all" ? ", " : " or ") + more;
  }
  return `${field} ${negated ? "not " : ""}${op} ${value}`.trim();
}

/** Human-readable one-liner for a condition tree. */
export function summarizeCondition(json: unknown, nested = false): string {
  if (!json || typeof json !== "object") return "No conditions";
  const c = json as ConditionJson;
  if ("not" in c) {
    const inner = c.not;
    if (inner && typeof inner === "object" && "field" in inner) return summarizePredicate(inner, true);
    return `not (${summarizeCondition(inner, false)})`;
  }
  if ("all" in c || "any" in c) {
    const list = "all" in c ? c.all : c.any;
    if (!Array.isArray(list) || list.length === 0) return "No conditions";
    const joiner = "all" in c ? " and " : " or ";
    const text = list.map((x) => summarizeCondition(x, true)).join(joiner);
    return nested && list.length > 1 ? `(${text})` : text;
  }
  if ("field" in c) return summarizePredicate(c);
  return "No conditions";
}
