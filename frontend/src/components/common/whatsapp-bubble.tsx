import { CheckCheck } from "lucide-react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

/** Render WhatsApp's lightweight formatting: *bold*, _italic_, ~strike~, `mono`, "> " quotes, links. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("http")) {
      out.push(
        <span key={key} className="break-all text-sky-700 underline dark:text-sky-300">
          {token}
        </span>,
      );
    } else {
      const inner = token.slice(1, -1);
      if (token[0] === "*") out.push(<strong key={key}>{inner}</strong>);
      else if (token[0] === "_") out.push(<em key={key}>{inner}</em>);
      else if (token[0] === "~") out.push(<s key={key}>{inner}</s>);
      else out.push(<code key={key} className="font-mono text-[0.85em]">{inner}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function WhatsAppText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        const key = `l${idx}`;
        if (line.startsWith("> ")) {
          return (
            <div key={key} className="my-1 border-l-[3px] border-wa/70 pl-2 text-[0.92em] opacity-85">
              {inline(line.slice(2), key)}
            </div>
          );
        }
        return (
          <Fragment key={key}>
            {line === "" ? <div className="h-2" /> : <div>{inline(line, key)}</div>}
          </Fragment>
        );
      })}
    </>
  );
}

export function WhatsAppBubble({
  text,
  time = "now",
  className,
  ticks = true,
}: {
  text: string;
  time?: string;
  className?: string;
  ticks?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-wa-canvas p-3 sm:p-4", className)}>
      <div className="relative ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-wa-bubble px-3 py-2 text-[13px] leading-relaxed text-foreground shadow-sm">
        <div className="break-words">
          <WhatsAppText text={text} />
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>{time}</span>
          {ticks ? <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" /> : null}
        </div>
      </div>
    </div>
  );
}

/** Mirror of the backend's alert template (app/notify/templates.py). */
export function renderAlertPreview(p: {
  rules: string[];
  mailbox?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  snippet?: string | null;
  webUrl?: string | null;
  detailsUrl?: string | null;
}): string {
  const plain = (t: string) => t.replace(/\*/g, "∗").replace(/_/g, "ˍ").replace(/~/g, "˜").replace(/`/g, "'");
  const clip = (t: string | null | undefined, n: number) => {
    const s = (t ?? "").split(/\s+/).filter(Boolean).join(" ");
    return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
  };
  const name = p.fromName ?? "";
  const addr = p.fromAddress ?? "";
  const sender = name && name.toLowerCase() !== addr ? `${plain(name)} <${addr}>` : addr;
  const lines = [
    "📬 *Important email*",
    `*Rule:* ${plain(p.rules.join(", ") || "—")}`,
    `*Inbox:* ${p.mailbox ?? ""}`,
    `*From:* ${sender}`,
    `*Subject:* ${plain(clip(p.subject, 120)) || "(no subject)"}`,
  ];
  const snippet = clip(p.snippet, 300);
  if (snippet) lines.push("", `> ${plain(snippet)}`);
  if (p.webUrl) lines.push("", `Open in mail: ${p.webUrl}`);
  if (p.detailsUrl) lines.push(`Details: ${p.detailsUrl}`);
  return lines.join("\n");
}

export interface ChatMessage {
  from: "me" | "bot";
  text: string;
  mono?: boolean;
}

/** A small WhatsApp-style conversation: your messages on the right, the bot's on the left. */
export function WhatsAppThread({ messages, className }: { messages: ChatMessage[]; className?: string }) {
  return (
    <div className={cn("space-y-2 rounded-xl bg-wa-canvas p-3 sm:p-4", className)}>
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            "relative max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed text-foreground shadow-sm",
            m.from === "me" ? "ml-auto rounded-tr-none bg-wa-bubble" : "mr-auto rounded-tl-none bg-card",
          )}
        >
          <div className={cn("break-words", m.mono && "font-mono text-[12px] whitespace-pre-wrap")}>
            {m.mono ? m.text : <WhatsAppText text={m.text} />}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            {m.from === "me" ? <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
