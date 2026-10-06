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

/* -------------------------------------------------------- plain English */

function words(v: unknown, joiner = " or "): string {
  const list = Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)];
  const shown = list.slice(0, 3).map(quote);
  const more = list.length > 3 ? ` (+${list.length - 3} more)` : "";
  return shown.join(joiner) + more;
}

function plainPredicate(p: PredicateJson, negated: boolean): string {
  const not = negated ? "not " : "";
  const any = (v: unknown) => words(v, p.op === "contains_all" ? " and " : " or ");
  switch (`${p.field}|${p.op}`) {
    case "from.domain|domain_matches":
      return `${not}from ${words(p.value, " or ").replace(/“|”/g, "")}`;
    case "from.address|equals":
      return `${not}from ${words(p.value, " or ").replace(/“|”/g, "")}`;
    case "from.name|contains":
      return `the sender's name ${negated ? "doesn't mention" : "mentions"} ${any(p.value)}`;
    case "subject|contains":
    case "subject|contains_all":
      return `the subject ${negated ? "doesn't mention" : "mentions"} ${any(p.value)}`;
    case "body|contains":
    case "body|contains_all":
      return `the text ${negated ? "doesn't mention" : "mentions"} ${any(p.value)}`;
    case "anywhere|contains":
    case "anywhere|contains_all":
      return `it ${negated ? "doesn't mention" : "mentions"} ${any(p.value)}`;
    case "has_attachment|is":
      return Boolean(p.value) !== negated ? "it has an attachment" : "it has no attachment";
    default:
      return summarizePredicate(p, negated);
  }
}

/** Friendlier one-liner for people, e.g. "from univ.edu and the subject mentions “admit card”". */
export function plainSummary(json: unknown, nested = false): string {
  if (!json || typeof json !== "object") return "anything";
  const c = json as ConditionJson;
  if ("not" in c) {
    const inner = c.not;
    if (inner && typeof inner === "object" && "field" in inner) return plainPredicate(inner, true);
    return `not (${plainSummary(inner)})`;
  }
  if ("all" in c || "any" in c) {
    const list = "all" in c ? c.all : c.any;
    if (!Array.isArray(list) || list.length === 0) return "anything";
    const text = list.map((x) => plainSummary(x, true)).join("all" in c ? " and " : " or ");
    return nested && list.length > 1 ? `(${text})` : text;
  }
  if ("field" in c) return plainPredicate(c, false);
  return "anything";
}
