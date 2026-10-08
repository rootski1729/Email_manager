"use client";

import { ArrowUp, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useAskEmail } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { ChatTurn } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { AnswerText } from "./answer-text";

const STARTERS = ["Summarize", "What do I need to do?", "Any dates or deadlines?", "Who's involved?"];
/** Earlier turns sent with each question. */
const HISTORY_TURNS = 6;

function Thinking() {
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

/**
 * Ask tab of the Assistant: a short conversation about one email and its earlier thread.
 * The conversation lives in component state only; the last few turns go with each question.
 */
export function AskEmail({ messageId }: { messageId: string }) {
  const ask = useAskEmail();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [failed, setFailed] = useState<{ question: string; error: unknown } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, ask.isPending, failed]);

  function send(text: string, history: ChatTurn[]) {
    setFailed(null);
    ask.mutate(
      { messageId, question: text, history: history.slice(-HISTORY_TURNS) },
      {
        onSuccess: (out) => setTurns((t) => [...t, { role: "assistant", content: out.answer }]),
        onError: (error) => setFailed({ question: text, error }),
      },
    );
  }

  function submit(raw: string) {
    const text = raw.trim();
    if (text.length < 2 || ask.isPending) return;
    const history = turns;
    setTurns((t) => [...t, { role: "user", content: text }]);
    setQuestion("");
    send(text, history);
  }

  function retry() {
    if (!failed || ask.isPending) return;
    // The failed question is already the last turn; its history is everything before it.
    send(failed.question, turns.slice(0, -1));
  }

  function clear() {
    ask.reset();
    setTurns([]);
    setFailed(null);
    setQuestion("");
    input.current?.focus();
  }

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {empty ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ask anything about this email and its thread.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={ask.isPending}
                  className="inline-flex h-8 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-4">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <li key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-pretty break-words text-accent-foreground">
                    {t.content}
                  </p>
                </li>
              ) : (
                <li key={i}>
                  <AnswerText text={t.content} />
                </li>
              ),
            )}
          </ol>
        )}
        {ask.isPending ? (
          <div className="mt-4">
            <Thinking />
          </div>
        ) : null}
        {failed && !ask.isPending ? (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-destructive">
            <span>{errorMessage(failed.error)}</span>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1 rounded-md font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <RotateCw className="size-3.5" aria-hidden /> Retry
            </button>
          </p>
        ) : null}
      </div>

      <form
        className="space-y-1.5 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <InputGroup>
          <InputGroupInput
            ref={input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this email…"
            aria-label="Ask about this email"
            maxLength={1000}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              size="icon-xs"
              variant="default"
              aria-label="Ask"
              // Not `disabled`: a disabled control greys the whole input group. Empty questions are ignored.
              className={cn(question.trim().length < 2 && "opacity-40")}
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {!empty ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="xs" onClick={clear} className="text-muted-foreground">
              Clear
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
