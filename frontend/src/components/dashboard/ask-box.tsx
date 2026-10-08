"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AnswerText } from "@/components/ai/answer-text";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAiAvailable, useAskMail } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/**
 * "Ask about your mail": one question in, one answer out, with links to the emails it used.
 * `compact` fits it inside a card (the mail list's Assistant): a smaller box and no card around the answer.
 */
export function AskBox({ compact = false }: { compact?: boolean }) {
  const available = useAiAvailable();
  const ask = useAskMail();
  const [question, setQuestion] = useState("");
  if (!available) return null;

  return (
    <section aria-label="Ask about your mail" className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          if (q.length >= 2 && !ask.isPending) ask.mutate(q);
        }}
      >
        <InputGroup className={compact ? undefined : "h-11 shadow-xs"}>
          {compact ? null : (
            <InputGroupAddon>
              <MessageCircleQuestion />
            </InputGroupAddon>
          )}
          <InputGroupInput
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={compact ? "e.g. When is my exam?" : "Ask about your mail, e.g. When is my exam?"}
            aria-label="Ask about your mail"
            maxLength={500}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              // In a card, a disabled button would grey the whole box out; empty questions are ignored anyway.
              disabled={compact ? undefined : question.trim().length < 2 || ask.isPending}
              className={cn(compact && question.trim().length < 2 && "text-muted-foreground/60")}
            >
              {ask.isPending ? <Spinner /> : null} Ask
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      {ask.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(ask.error)}
        </p>
      ) : null}
      {compact && ask.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Thinking…
        </p>
      ) : null}
      {ask.data ? (
        <div
          className={cn("space-y-2 text-sm", !compact && "rounded-xl border bg-card px-4 py-3")}
          aria-live="polite"
        >
          <AnswerText text={ask.data.answer} />
          {ask.data.refs.length ? (
            <ul className="flex flex-col gap-1">
              {ask.data.refs.map((r) => (
                <li key={r.message_id} className="min-w-0 truncate">
                  <Link href={`/messages/${r.message_id}`} className="text-brand-ink underline-offset-2 hover:underline">
                    {r.ref ? <span className="font-mono font-medium">#{r.ref} </span> : null}
                    {r.subject || "(no subject)"}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
