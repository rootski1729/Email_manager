"use client";

import { ArrowUp, RotateCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useStreamingAnswer } from "@/lib/api/stream";
import type { ChatTurn } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { AnswerMarkdown, Thinking } from "./answer-markdown";

const STARTERS = ["Summarize", "What do I need to do?", "Any dates or deadlines?", "Who's involved?"];
/** Earlier turns sent with each question. */
const HISTORY_TURNS = 6;

interface Exchange {
  id: number;
  question: string;
  answer: string;
  /** Stopped answers stay on screen but aren't sent back as history. */
  stopped: boolean;
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-pretty break-words text-accent-foreground">{text}</p>
    </div>
  );
}

function historyOf(exchanges: Exchange[]): ChatTurn[] {
  return exchanges
    .filter((e) => !e.stopped)
    .flatMap((e): ChatTurn[] => [
      { role: "user", content: e.question },
      { role: "assistant", content: e.answer },
    ])
    .slice(-HISTORY_TURNS);
}

/**
 * Ask tab of the Assistant: a short conversation about one email and its earlier thread, answered as it is
 * written. The conversation lives in component state only; the last few finished turns go with each question.
 */
export function AskEmail({ messageId }: { messageId: string }) {
  const stream = useStreamingAnswer<{ question: string; history: ChatTurn[] }>(
    `/api/v1/messages/${encodeURIComponent(messageId)}/ai/ask/stream`,
  );
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  /** The question being answered (or that failed), shown below the finished ones. */
  const [pending, setPending] = useState<{ id: number; question: string } | null>(null);
  const [question, setQuestion] = useState("");
  const nextId = useRef(1);
  /** Bumped by Clear, so an answer stopped by clearing isn't added back afterwards. */
  const epoch = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const streaming = stream.status === "streaming";

  // A new question always scrolls to the end; a growing answer follows only if the reader is already there.
  const pinned = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinned.current = true;
  }, [exchanges.length, pending?.id, stream.status]);
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [stream.text]);

  async function ask(text: string, history: ChatTurn[]) {
    const id = nextId.current++;
    const started = epoch.current;
    setPending({ id, question: text });
    const outcome = await stream.start({ question: text, history });
    if (epoch.current !== started || outcome.status === "error") return; // cleared, or kept pending with Retry
    setPending((p) => (p?.id === id ? null : p));
    if (outcome.status === "stopped" && !outcome.text.trim()) {
      // Stopped before a word arrived: drop the question too, and put it back in the box.
      setQuestion((q) => q || text);
      stream.reset();
      return;
    }
    setExchanges((list) => [...list, { id, question: text, answer: outcome.text, stopped: outcome.status === "stopped" }]);
    stream.reset();
  }

  function submit(raw: string) {
    const text = raw.trim();
    if (text.length < 2 || streaming) return;
    setQuestion("");
    void ask(text, historyOf(exchanges));
  }

  function retry() {
    if (!pending || streaming) return;
    void ask(pending.question, historyOf(exchanges));
  }

  function clear() {
    epoch.current += 1;
    stream.reset();
    setExchanges([]);
    setPending(null);
    setQuestion("");
    input.current?.focus();
  }

  const empty = exchanges.length === 0 && !pending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {empty ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ask anything about this email and its thread.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={streaming}
                  className="inline-flex h-8 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-5">
            {exchanges.map((e) => (
              <li key={e.id} className="space-y-2.5">
                <Question text={e.question} />
                <AnswerMarkdown text={e.answer} />
                {e.stopped ? <p className="text-xs text-muted-foreground">Stopped</p> : null}
              </li>
            ))}
            {pending ? (
              <li key={pending.id} className="space-y-2.5">
                <Question text={pending.question} />
                <div aria-live="polite">
                  {stream.text ? (
                    <AnswerMarkdown text={stream.text} streaming={streaming} />
                  ) : streaming ? (
                    <Thinking />
                  ) : null}
                  {stream.status === "error" ? (
                    <p role="alert" className={cn("flex flex-wrap items-center gap-x-2 text-sm text-destructive", stream.text && "mt-2")}>
                      <span>{stream.error}</span>
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
              </li>
            ) : null}
          </ol>
        )}
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
            placeholder={streaming ? "Answering…" : "Ask about this email…"}
            aria-label="Ask about this email"
            // Read-only rather than disabled while answering: a disabled control greys the whole group, Stop included.
            readOnly={streaming}
            aria-disabled={streaming || undefined}
            className={cn(streaming && "text-muted-foreground")}
            maxLength={1000}
          />
          <InputGroupAddon align="inline-end">
            {streaming ? (
              <InputGroupButton type="button" size="xs" variant="secondary" onClick={stream.stop} aria-label="Stop answering">
                <Square className="size-2.5 fill-current" aria-hidden /> Stop
              </InputGroupButton>
            ) : (
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
            )}
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
