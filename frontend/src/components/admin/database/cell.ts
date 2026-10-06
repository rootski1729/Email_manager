import type { DbColumn } from "@/lib/admin/types";

export const HIDDEN_MASK = "••••••";

/** Compact one-line rendering of a value for the grid. */
export function cellText(col: DbColumn, value: unknown): string {
  if (col.hidden) return value == null ? "—" : HIDDEN_MASK;
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (col.type === "datetime" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The editable text form of a value (what goes into an input). */
export function draftOf(col: DbColumn, value: unknown): string | boolean {
  if (col.type === "boolean") return Boolean(value);
  if (value === null || value === undefined) return "";
  if (col.type === "json") return JSON.stringify(value, null, 2);
  if (col.type === "array") return Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
  return String(value);
}

export function enumOptions(type: string): string[] | null {
  return type.startsWith("enum:") ? type.slice(5).split(",").filter(Boolean) : null;
}

/** Turn an edited draft back into the JSON value the API expects; throws a readable Error. */
export function valueOf(col: DbColumn, draft: string | boolean): unknown {
  if (col.type === "boolean") return Boolean(draft);
  const text = String(draft);
  if (text.trim() === "") {
    if (col.nullable) return null;
    if (col.type === "text" || enumOptions(col.type)) return "";
    throw new Error(`${col.name} can't be empty`);
  }
  switch (col.type) {
    case "integer": {
      const n = Number(text);
      if (!Number.isInteger(n)) throw new Error(`${col.name} must be a whole number`);
      return n;
    }
    case "number": {
      const n = Number(text);
      if (Number.isNaN(n)) throw new Error(`${col.name} must be a number`);
      return n;
    }
    case "json":
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`${col.name} isn't valid JSON`);
      }
    case "array":
      // The API accepts a JSON array or a comma-separated list.
      return text;
    default:
      return text;
  }
}
