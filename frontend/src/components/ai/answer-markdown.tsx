"use client";

import Link from "next/link";
import { useMemo } from "react";
import Markdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AskRef } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Marks where the streaming caret goes; a private-use character the model never writes. */
const CARET = "";
/** A WhatsApp code mention like "#K7" (same alphabet as the backend's refs). */
const MENTION = /#([2-9A-HJKMNP-Z]{2,6})\b/gi;
const SPLIT = new RegExp(`(${CARET})|${MENTION.source}`, "gi");
const SAFE_URL = /^https?:\/\//i;

/* Minimal mdast shapes: enough for the walker below without depending on @types/mdast. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string | boolean> };
}

/**
 * Remark plugin: turns the caret marker into an empty <span data-caret> and, when `mentions` is on, "#K7"
 * into <span data-ref="K7">. Code and existing links are left alone (a caret inside code is dropped).
 */
function remarkAnswer({ mentions }: { mentions: boolean }) {
  function split(value: string): MdNode[] {
    const out: MdNode[] = [];
    let last = 0;
    for (const m of value.matchAll(SPLIT)) {
      const at = m.index ?? 0;
      if (at > last) out.push({ type: "text", value: value.slice(last, at) });
      if (m[1]) {
        out.push({ type: "caret", children: [], data: { hName: "span", hProperties: { dataCaret: true } } });
      } else if (mentions) {
        const ref = m[2].toUpperCase();
        out.push({
          type: "mention",
          children: [{ type: "text", value: `#${ref}` }],
          data: { hName: "span", hProperties: { dataRef: ref } },
        });
      } else {
        out.push({ type: "text", value: m[0] });
      }
      last = at + m[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  }

  function walk(node: MdNode) {
    if (node.type === "code" || node.type === "inlineCode") {
      if (node.value) node.value = node.value.replaceAll(CARET, "");
      return;
    }
    if (!node.children || node.type === "link" || node.type === "linkReference") return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value) return split(child.value);
      walk(child);
      return [child];
    });
  }

  return (tree: MdNode) => walk(tree);
}

/**
 * Make half-written Markdown look settled while it streams: close an open **bold**, drop a lone trailing
 * "*", and give a bare "-" its space so it becomes a list item rather than a heading underline.
 */
function tidyPartial(text: string): string {
  let s = text;
  if (/\n[ \t]*-$/.test(s) || s === "-") s += " ";
  const bolds = (s.replace(/`[^`]*`/g, "").match(/\*\*/g) ?? []).length;
  if (bolds % 2 === 1) s = s.endsWith("**") ? s.slice(0, -2) : `${s.trimEnd()}**`;
  if (/[^*]\*$/.test(s) || s === "*") s = s.slice(0, -1);
  return s;
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.2em] rounded-full bg-brand animate-caret motion-reduce:animate-none motion-reduce:opacity-60"
    />
  );
}

const mentionClass =
  "rounded-[5px] bg-accent px-[3px] py-px font-mono text-[0.8em] font-semibold text-brand-ink tabular whitespace-nowrap";

/**
 * An AI answer as compact Markdown (GFM). Raw HTML is never rendered and only http(s) links are kept.
 * `streaming` shows a caret at the end and smooths over half-written Markdown. With `refs` (the general Ask),
 * "#K7" mentions become small links to the cited emails.
 */
export function AnswerMarkdown({
  text,
  streaming = false,
  refs,
  className,
}: {
  text: string;
  streaming?: boolean;
  refs?: AskRef[];
  className?: string;
}) {
  const mentions = refs !== undefined;
  const byRef = useMemo(() => new Map((refs ?? []).flatMap((r) => (r.ref ? [[r.ref.toUpperCase(), r] as const] : []))), [refs]);

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => <p className="font-semibold">{children}</p>,
      h2: ({ children }) => <p className="font-semibold">{children}</p>,
      h3: ({ children }) => <p className="font-semibold">{children}</p>,
      h4: ({ children }) => <p className="font-semibold">{children}</p>,
      h5: ({ children }) => <p className="font-semibold">{children}</p>,
      h6: ({ children }) => <p className="font-semibold">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground/70">{children}</ul>,
      ol: ({ children }) => (
        <ol className="list-decimal space-y-0.5 pl-5 marker:text-muted-foreground/80 marker:tabular">{children}</ol>
      ),
      li: ({ children }) => <li className="pl-0.5 [&>p+p]:mt-1 [&>ul]:mt-0.5 [&>ol]:mt-0.5">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
      ),
      code: ({ children, className: lang }) => (
        <code className={cn("rounded bg-muted px-1 py-px font-mono text-[0.85em]", lang)}>{children}</code>
      ),
      pre: ({ children }) => (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
          {children}
        </pre>
      ),
      hr: () => <hr className="border-border" />,
      table: ({ children }) => (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
            {children}
          </table>
        </div>
      ),
      a: ({ href, children }) =>
        href && SAFE_URL.test(href) ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-brand-ink underline decoration-brand-ink/30 underline-offset-2 hover:decoration-brand-ink"
          >
            {children}
          </a>
        ) : (
          <span>{children}</span>
        ),
      span: ({ node, children }) => {
        const props = node?.properties ?? {};
        if (props.dataCaret !== undefined) return <Caret />;
        const ref = typeof props.dataRef === "string" ? props.dataRef : null;
        if (!ref) return <span>{children}</span>;
        const cited = byRef.get(ref);
        if (cited) {
          return (
            <Link
              href={`/messages/${cited.message_id}`}
              title={cited.subject || undefined}
              className={cn(
                mentionClass,
                "outline-none hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              {children}
            </Link>
          );
        }
        // Still streaming (refs arrive at the end): look the same so nothing shifts. Afterwards, plain code.
        return <span className={cn(mentionClass, !streaming && "bg-transparent px-0 font-medium text-muted-foreground")}>{children}</span>;
      },
    }),
    [byRef, streaming],
  );

  const source = streaming ? `${tidyPartial(text)}${CARET}` : text.trim();
  const plugins = useMemo<Options["remarkPlugins"]>(() => [remarkGfm, [remarkAnswer, { mentions }]], [mentions]);

  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed text-pretty break-words",
        className,
      )}
      aria-busy={streaming || undefined}
    >
      <Markdown
        skipHtml
        remarkPlugins={plugins}
        components={components}
        disallowedElements={["img"]}
      >
        {source}
      </Markdown>
    </div>
  );
}

/** Shown until the first words of an answer arrive. */
export function Thinking() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-pulse rounded-full bg-brand-ink/60" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      Thinking…
    </p>
  );
}
