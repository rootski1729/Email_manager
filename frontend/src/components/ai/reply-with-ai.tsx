"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { replyIdeasQuery, useDraftReply } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { Draft } from "@/lib/api/types";
import { DraftEditor } from "./draft-editor";

function Label({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <p className="text-sm font-medium">
      {children} <span className="font-normal text-muted-foreground">· {hint}</span>
    </p>
  );
}

/**
 * Inline panel on a message. Two clearly separate paths: steer and pick one of three ideas,
 * or say what to reply and get a draft straight away. Then edit and send.
 */
export function ReplyWithAiPanel({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const [guidance, setGuidance] = useState("");
  const [steer, setSteer] = useState("");
  const ideas = useQuery(replyIdeasQuery(messageId, guidance));
  const draft = useDraftReply();
  const [prompt, setPrompt] = useState("");

  function steerIdeas() {
    const text = steer.trim();
    if (ideas.isFetching || (!text && !guidance)) return;
    if (text === guidance) void ideas.refetch();
    else setGuidance(text);
  }
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
        <div className="max-w-2xl space-y-5">
          <div className="space-y-2.5">
            <Label hint="tap one to draft it">Ideas</Label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                steerIdeas();
              }}
            >
              <InputGroup className="h-8">
                <InputGroupInput
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                  placeholder="Steer the ideas, e.g. more formal"
                  aria-label="Steer the ideas"
                  maxLength={300}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="submit">
                    {ideas.isFetching && ideas.data ? <Spinner className="size-3.5" /> : null}
                    New ideas
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
            <div className="flex min-h-8 flex-wrap items-center gap-2" aria-busy={ideas.isFetching}>
              {ideas.isPending ? (
                <>
                  <Skeleton className="h-8 w-32 rounded-lg" />
                  <Skeleton className="h-8 w-40 rounded-lg" />
                  <Skeleton className="h-8 w-28 rounded-lg" />
                </>
              ) : ideas.isError ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span>Couldn&apos;t get ideas right now.</span>
                  <button
                    type="button"
                    onClick={() => void ideas.refetch()}
                    disabled={ideas.isFetching}
                    className="inline-flex items-center gap-1 rounded-md font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    {ideas.isFetching ? <Spinner className="size-3.5" /> : <RotateCw className="size-3.5" aria-hidden />}
                    Try again
                  </button>
                </p>
              ) : (
                ideas.data.map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    title={idea.instruction}
                    onClick={() => write(idea.instruction)}
                    className="inline-flex h-8 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    {idea.label}
                  </button>
                ))
              )}
            </div>
          </div>
          <form
            className="space-y-2.5 border-t pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              write(prompt);
            }}
          >
            <Label hint="AI drafts it straight away">Or write the reply now</Label>
            <InputGroup>
              <InputGroupInput
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Say what to reply…"
                aria-label="What to reply"
                maxLength={2000}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit">
                  Write
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
          {draft.isError ? (
            <p role="alert" className="-mt-2 text-sm text-destructive">
              {errorMessage(draft.error)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Nothing is sent until you press Send.</p>
        </div>
      )}
    </section>
  );
}
