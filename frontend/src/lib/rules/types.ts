import type { components } from "@/lib/api/schema";

type S = components["schemas"];

/** Wire format of a rule condition, generated from the API's recursive Condition schema. */
export type Op =
  | "equals"
  | "contains"
  | "contains_all"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "exists"
  | "domain_matches"
  | "is";

export type PredicateJson = S["Predicate"];

export type ConditionJson = S["Predicate"] | S["AllOf-Input"] | S["AnyOf-Input"] | S["NotOf-Input"];

export interface NotifyActionJson {
  destinations: string[];
  mode: "instant" | "digest";
  /** Deliver even during quiet hours and skip the digest. */
  urgent?: boolean;
}

export interface ActionsJson {
  notify?: NotifyActionJson | null;
}

export const LIMITS = {
  maxDepth: 6,
  maxNodes: 60,
  maxValues: 25,
  maxValueLength: 300,
  maxRegexLength: 500,
} as const;

export const MULTI_VALUE_OPS: Op[] = [
  "equals",
  "contains",
  "contains_all",
  "starts_with",
  "ends_with",
  "domain_matches",
];

export const OP_LABELS: Record<Op, string> = {
  equals: "is exactly",
  contains: "contains",
  contains_all: "contains all of",
  starts_with: "starts with",
  ends_with: "ends with",
  regex: "matches regex",
  exists: "exists",
  domain_matches: "is in domain",
  is: "is",
};

export const OP_HINTS: Partial<Record<Op, string>> = {
  equals: "Matches when the field equals any of the values.",
  contains: "Matches when the field contains any of the values.",
  contains_all: "Matches only when every value appears.",
  domain_matches: "univ.edu matches univ.edu and any subdomain like exam.univ.edu, never notuniv.edu.",
  regex: "RE2 syntax, e.g. \\b(mid|end)[- ]?sem\\b",
  exists: "Matches when the header or field is present.",
};

export const HEADER_PREFIX = "header:";
