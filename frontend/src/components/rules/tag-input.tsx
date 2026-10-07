"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/** Chips input: Enter, comma or Tab adds a value; Backspace on empty removes the last; paste splits lines/commas. */
export function TagInput({
  values,
  onChange,
  placeholder,
  max = 25,
  invalid,
  mono = false,
  ariaLabel,
  isValueInvalid,
  id: inputId,
  normalize,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  max?: number;
  invalid?: boolean;
  mono?: boolean;
  ariaLabel: string;
  /** Marks individual chips as invalid (e.g. malformed email addresses). */
  isValueInvalid?: (value: string) => boolean;
  id?: string;
  normalize?: (value: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const generatedId = useId();
  const id = inputId ?? generatedId;

  function add(raw: string[]) {
    const next = [...values];
    for (const r of raw) {
      const v = normalize ? normalize(r.trim()) : r.trim();
      if (v && !next.includes(v) && next.length < max) next.push(v);
    }
    if (next.length !== values.length) onChange(next);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/15",
        invalid && "border-destructive ring-destructive/20",
      )}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {values.map((v, i) => {
        const bad = isValueInvalid?.(v) ?? false;
        return (
        <span
          key={`${v}-${i}`}
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 rounded-md bg-secondary py-0.5 pr-0.5 pl-2 text-xs text-secondary-foreground",
            mono && "font-mono",
            bad && "bg-destructive/10 text-destructive ring-1 ring-destructive/30 ring-inset",
          )}
          title={bad ? "Not a valid email address" : undefined}
        >
          <span className="truncate">{v}</span>
          {bad ? <span className="sr-only"> (invalid)</span> : null}
          <button
            type="button"
            className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove ${v}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(values.filter((_, j) => j !== i));
            }}
          >
            <X className="size-3" />
          </button>
        </span>
        );
      })}
      <input
        id={id}
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={values.length >= max}
        placeholder={values.length === 0 ? placeholder : values.length >= max ? `Limit of ${max} reached` : "Add another…"}
        className={cn(
          "h-6 min-w-[8rem] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          mono && "font-mono",
        )}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v.split(","));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) {
            e.preventDefault();
            add([draft]);
          } else if (e.key === "Enter") {
            e.preventDefault();
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add([draft])}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[\n,;]/.test(text)) {
            e.preventDefault();
            add(text.split(/[\n,;]/));
          }
        }}
      />
    </div>
  );
}
