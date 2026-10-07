"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { replyIdeasQuery, useDraftReply } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { Draft } from "@/lib/api/types";
import { DraftEditor } from "./draft-editor";

/** Inline panel on a message: pick a reply idea or say what to reply, then edit and send. */
export function ReplyWithAiPanel({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const ideas = useQuery(replyIdeasQuery(messageId));
  const draft = useDraftReply();
  const [prompt, setPrompt] = useState("");
  const [current, setCurrent] = useState<{ draft: Draft; n: number } | null>(null);

  function write(instructions: string) {
    const text = instructions.trim();
    if (!text || draft.isPending) return;
    draft.mutate(
      { messageId, instructions: text },
      { onSuccess: (d) => setCurrent((c) => ({ draft: d, n: (c?.n ?? 0) + 1 })) },
    );
  }

  return (
    <section aria-label="Reply with AI" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Sparkles className="size-4 text-brand-ink" aria-hidden /> Reply with AI
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      {current ? (
        <DraftEditor key={current.n} draft={current.draft} onSent={onClose} onDiscard={onClose} />
      ) : draft.isPending ? (
        <div className="space-y-3" aria-busy>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Writing a draft…
          </p>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {ideas.isPending ? (
              <>
                <Skeleton className="h-8 w-32 rounded-full" />
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </>
            ) : ideas.isError ? (
              <p className="text-sm text-muted-foreground">No ideas this time. Say what to reply below.</p>
            ) : (
              ideas.data.map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  title={idea.instruction}
                  onClick={() => write(idea.instruction)}
                  className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {idea.label}
                </button>
              ))
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              write(prompt);
            }}
          >
            <InputGroup>
              <InputGroupInput
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Or say what to reply…"
                aria-label="What to reply"
                maxLength={2000}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" disabled={!prompt.trim()}>
                  Write
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
          {draft.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(draft.error)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Nothing is sent until you press Send.</p>
        </div>
      )}
    </section>
  );
}
