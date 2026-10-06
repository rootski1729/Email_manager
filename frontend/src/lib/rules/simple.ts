import { LIMITS, type ConditionJson, type PredicateJson } from "./types";

/**
 * "Simple mode" for the rule editor: the three things most people want, combined with AND.
 *   - from these senders (addresses or domains, any of them)
 *   - subject mentions any of these words
 *   - anywhere in the email mentions any of these words
 * Rules that fit this shape open in simple mode; anything richer opens in the advanced builder.
 */
export interface SimpleRule {
  senders: string[];
  subjectWords: string[];
  anyWords: string[];
}

export const EMPTY_SIMPLE: SimpleRule = { senders: [], subjectWords: [], anyWords: [] };

const clean = (list: string[]) => list.map((v) => v.trim()).filter(Boolean);

export function isAddress(v: string) {
  return v.includes("@") && !v.startsWith("@");
}

/** "@univ.edu" and "univ.edu" are both a domain. */
export function normalizeSender(v: string) {
  const t = v.trim().toLowerCase();
  return t.startsWith("@") ? t.slice(1) : t;
}

export function isValidSender(v: string) {
  if (isAddress(v)) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v);
}

function value(list: string[]): string | string[] {
  return list.length === 1 ? list[0] : list;
}

function pred(field: string, op: PredicateJson["op"], list: string[]): PredicateJson {
  // Same key order as the builder's toJson, so switching editors doesn't look like an edit.
  return { field, op, case_sensitive: false, value: value(list) };
}

export function simpleIsEmpty(s: SimpleRule) {
  return clean(s.senders).length + clean(s.subjectWords).length + clean(s.anyWords).length === 0;
}

/** Returns a message, or null when the simple rule can be saved. */
export function validateSimple(s: SimpleRule): string | null {
  if (simpleIsEmpty(s)) return "Add at least one sender or word to watch for.";
  const senders = clean(s.senders);
  const bad = senders.find((v) => !isValidSender(v));
  if (bad) return `“${bad}” doesn't look like an email address or a domain like univ.edu.`;
  for (const list of [s.senders, s.subjectWords, s.anyWords]) {
    if (clean(list).length > LIMITS.maxValues) return `You can add up to ${LIMITS.maxValues} entries in each box.`;
    if (clean(list).some((v) => v.length > LIMITS.maxValueLength)) return "One of the entries is too long.";
  }
  return null;
}

export function simpleToJson(s: SimpleRule): ConditionJson {
  const senders = clean(s.senders).map(normalizeSender);
  const addresses = senders.filter(isAddress);
  const domains = senders.filter((v) => !isAddress(v));
  const parts: ConditionJson[] = [];
  const senderPreds: ConditionJson[] = [];
  if (addresses.length) senderPreds.push(pred("from.address", "equals", addresses));
  if (domains.length) senderPreds.push(pred("from.domain", "domain_matches", domains));
  if (senderPreds.length === 1) parts.push(senderPreds[0]);
  else if (senderPreds.length > 1) parts.push({ any: senderPreds });
  const subject = clean(s.subjectWords);
  if (subject.length) parts.push(pred("subject", "contains", subject));
  const anywhere = clean(s.anyWords);
  if (anywhere.length) parts.push(pred("anywhere", "contains", anywhere));
  return { all: parts };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function listOf(v: unknown): string[] | null {
  if (typeof v === "string") return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  return null;
}

type Slot = "address" | "domain" | "subject" | "anywhere";

function slotOf(p: Record<string, unknown>): Slot | null {
  if (p.case_sensitive) return null;
  if (p.field === "from.address" && p.op === "equals") return "address";
  if (p.field === "from.domain" && p.op === "domain_matches") return "domain";
  if (p.field === "subject" && p.op === "contains") return "subject";
  if (p.field === "anywhere" && p.op === "contains") return "anywhere";
  return null;
}

/** The simple form of a condition, or null when it needs the advanced builder. */
export function simpleFromJson(json: unknown): SimpleRule | null {
  if (json == null || (isObject(json) && Object.keys(json).length === 0)) return { ...EMPTY_SIMPLE };
  if (!isObject(json)) return null;
  let children: unknown[];
  if ("all" in json && Array.isArray(json.all)) children = json.all;
  else if ("field" in json || "any" in json) children = [json];
  else return null;

  const got: Partial<Record<Slot, string[]>> = {};
  const put = (slot: Slot, values: string[]) => {
    if (got[slot]) return false;
    got[slot] = values;
    return true;
  };

  for (const child of children) {
    if (!isObject(child)) return null;
    if ("any" in child) {
      // Only "from this address OR that domain" is allowed as a nested group.
      if (!Array.isArray(child.any) || child.any.length === 0) return null;
      for (const p of child.any) {
        if (!isObject(p) || !("field" in p)) return null;
        const slot = slotOf(p);
        const values = listOf(p.value);
        if ((slot !== "address" && slot !== "domain") || !values || !put(slot, values)) return null;
      }
      continue;
    }
    if (!("field" in child)) return null;
    const slot = slotOf(child);
    const values = listOf(child.value);
    if (!slot || !values || !put(slot, values)) return null;
  }
  return {
    senders: [...(got.address ?? []), ...(got.domain ?? [])],
    subjectWords: got.subject ?? [],
    anyWords: got.anywhere ?? [],
  };
}
