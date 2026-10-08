"use client";

import { RotateCw, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { AnswerMarkdown, Thinking } from "@/components/ai/answer-markdown";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useAiAvailable } from "@/lib/api/ai";
import { useStreamingAnswer } from "@/lib/api/stream";
import { cn } from "@/lib/utils";

/**
 * "Ask about your mail": one question in, one answer written out as it comes, then links to the emails it
 * cites. `compact` fits it inside a card (the mail list's Assistant): a smaller box and no card around the answer.
 */
export function AskBox({ compact = false }: { compact?: boolean }) {
  const available = useAiAvailable();
  const stream = useStreamingAnswer<{ question: string }>("/api/v1/ai/ask/stream");
  const [question, setQuestion] = useState("");
  const asked = useRef("");
  if (!available) return null;

  const streaming = stream.status === "streaming";
  const done = stream.status === "done";
  const showAnswer = stream.text.length > 0;
  const ready = question.trim().length >= 2;

  function ask(q: string) {
    asked.current = q;
    void stream.start({ question: q });
  }

  return (
    <section aria-label="Ask about your mail" className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          if (q.length >= 2 && !streaming) ask(q);
        }}
      >
        <InputGroup
          className={cn(
            "hover:border-(--lift-border)",
            !compact && "h-12 bg-card pl-1 shadow-xs dark:bg-card",
          )}
        >
          {compact ? null : (
            <InputGroupAddon>
              <Sparkles className="size-[18px] text-brand-ink" aria-hidden />
            </InputGroupAddon>
          )}
          <InputGroupInput
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={compact ? "e.g. When is my exam?" : "Ask about your mail, e.g. When is my exam?"}
            aria-label="Ask about your mail"
            // Read-only rather than disabled while answering: a disabled control greys the whole group, Stop included.
            readOnly={streaming}
            aria-disabled={streaming || undefined}
            className={cn(streaming && "text-muted-foreground")}
            maxLength={500}
          />
          <InputGroupAddon align="inline-end">
            {streaming ? (
              <InputGroupButton type="button" variant="secondary" onClick={stream.stop} aria-label="Stop answering">
                <Square className="size-2.5 fill-current" aria-hidden /> Stop
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                // Iris once there's a question to send; a quiet chip until then. Empty questions are ignored anyway,
                // so the button never looks disabled.
                variant={ready ? "default" : compact ? "ghost" : "secondary"}
                aria-disabled={!ready || undefined}
                className={cn(
                  compact ? "h-7 rounded-lg px-2.5" : "h-8 rounded-lg px-3.5",
                  !ready && "text-muted-foreground hover:text-muted-foreground",
                )}
              >
                Ask
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
      {streaming && !showAnswer ? <Thinking /> : null}
      {showAnswer ? (
        <div
          className={cn("space-y-3 text-sm", !compact && "animate-rise rounded-2xl border bg-card px-4 py-3")}
          aria-live="polite"
        >
          <AnswerMarkdown text={stream.text} streaming={streaming} refs={done ? stream.refs : []} />
          {stream.stopped ? <p className="text-xs text-muted-foreground">Stopped</p> : null}
          {done && stream.refs.length ? (
            <div className="space-y-1.5 border-t pt-2.5">
              <p className="text-xs font-medium text-muted-foreground">From your emails</p>
              <ul className="flex flex-col gap-1">
                {stream.refs.map((r) => (
                  <li key={r.message_id} className="min-w-0 truncate">
                    <Link href={`/messages/${r.message_id}`} className="text-brand-ink underline-offset-2 hover:underline">
                      {r.ref ? <span className="font-mono font-medium">#{r.ref} </span> : null}
                      {r.subject || "(no subject)"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {stream.status === "error" ? (
        <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-destructive">
          <span>{stream.error}</span>
          <button
            type="button"
            onClick={() => ask(asked.current)}
            className="inline-flex items-center gap-1 rounded-md font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <RotateCw className="size-3.5" aria-hidden /> Retry
          </button>
        </p>
      ) : null}
    </section>
  );
}
