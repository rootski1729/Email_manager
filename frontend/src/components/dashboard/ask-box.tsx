"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAiAvailable, useAskMail } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";

/** "Ask about your mail": one question in, one answer out, with links to the emails it used. */
export function AskBox() {
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
        <InputGroup className="h-11 shadow-xs">
          <InputGroupAddon>
            <MessageCircleQuestion />
          </InputGroupAddon>
          <InputGroupInput
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your mail, e.g. When is my exam?"
            aria-label="Ask about your mail"
            maxLength={500}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" disabled={question.trim().length < 2 || ask.isPending}>
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
      {ask.data ? (
        <div className="space-y-2 rounded-xl border bg-card px-4 py-3 text-sm" aria-live="polite">
          <p className="whitespace-pre-line text-pretty">{ask.data.answer}</p>
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
