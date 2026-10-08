"use client";

import { useQuery } from "@tanstack/react-query";
import { PenLine, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { replyIdeasQuery, useBlankReply, useDraftReply } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { Draft } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { DraftEditor } from "./draft-editor";

function Label({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <p className="text-sm font-medium">
      {children} <span className="font-normal text-muted-foreground">· {hint}</span>
    </p>
  );
}

/** The two AI paths: steer and pick one of three ideas, or say what to reply. Both end in a draft. */
function AiPaths({ messageId, onWrite }: { messageId: string; onWrite: (instructions: string) => void }) {
  const [guidance, setGuidance] = useState("");
  const [steer, setSteer] = useState("");
  const [prompt, setPrompt] = useState("");
  const ideas = useQuery(replyIdeasQuery(messageId, guidance));

  function steerIdeas() {
    const text = steer.trim();
    if (ideas.isFetching || (!text && !guidance)) return;
    if (text === guidance) void ideas.refetch();
    else setGuidance(text);
  }

  return (
    <>
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
              placeholder="Steer the ideas, e.g. politely decline"
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
              <Skeleton className="h-8 w-28 rounded-lg" />
              <Skeleton className="h-8 w-36 rounded-lg" />
              <Skeleton className="h-8 w-24 rounded-lg" />
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
                onClick={() => onWrite(idea.instruction)}
                className="inline-flex min-h-8 items-center rounded-lg bg-secondary px-3 py-1 text-left text-sm font-medium text-secondary-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring"
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
          onWrite(prompt);
        }}
      >
        <Label hint="drafts it straight away">Write with AI</Label>
        <InputGroup>
          <InputGroupInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Say what to reply…"
            aria-label="What to reply"
            maxLength={2000}
            data-reply-focus
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit">
              Write
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </>
  );
}

/**
 * Reply tab of the Assistant. AI ideas, "say what to reply", or an empty draft to write by hand;
 * every path ends in the editable draft, and nothing is sent until Send is pressed.
 */
export function ReplyPanel({ messageId, aiAvailable }: { messageId: string; aiAvailable: boolean }) {
  const draft = useDraftReply();
  const blank = useBlankReply();
  const [current, setCurrent] = useState<{ draft: Draft; n: number; handwritten: boolean } | null>(null);
  const [sent, setSent] = useState(false);

  function open(d: Draft, handwritten: boolean) {
    setCurrent((c) => ({ draft: d, n: (c?.n ?? 0) + 1, handwritten }));
  }

  function write(instructions: string) {
    const text = instructions.trim();
    if (!text || draft.isPending) return;
    draft.mutate({ messageId, instructions: text }, { onSuccess: (d) => open(d, false) });
  }

  function writeYourself() {
    if (blank.isPending) return;
    blank.mutate(messageId, { onSuccess: (d) => open(d, true) });
  }

  function reset() {
    setCurrent(null);
    setSent(false);
    draft.reset();
    blank.reset();
  }

  if (sent) {
    return (
      <div className="space-y-4 py-2" role="status">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">
            Sent <span className="text-success">✓</span>
          </span>
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <Link href="/sent" className="text-brand-ink underline-offset-2 hover:underline">
            see it in Sent
          </Link>
        </p>
        <Button variant="outline" size="sm" onClick={reset}>
          Write another
        </Button>
      </div>
    );
  }

  if (current) {
    return (
      <DraftEditor
        key={current.n}
        draft={current.draft}
        handwritten={current.handwritten}
        canRevise={aiAvailable}
        notify={false}
        onSent={() => setSent(true)}
        onDiscard={reset}
      />
    );
  }

  if (draft.isPending) {
    return (
      <div className="space-y-3" aria-busy>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Writing a draft…
        </p>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const problem = draft.error ?? blank.error;

  return (
    <div className="space-y-5">
      {aiAvailable ? (
        <AiPaths messageId={messageId} onWrite={write} />
      ) : (
        <p className="text-sm text-muted-foreground">Write your reply here and send it from your own mailbox.</p>
      )}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(problem)}
        </p>
      ) : null}
      <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2", aiAvailable && "border-t pt-3")}>
        <Button
          variant={aiAvailable ? "ghost" : "default"}
          size={aiAvailable ? "sm" : "default"}
          className={aiAvailable ? "-ml-3" : undefined}
          onClick={writeYourself}
          disabled={blank.isPending}
          data-reply-focus={aiAvailable ? undefined : true}
        >
          {blank.isPending ? <Spinner /> : <PenLine />} Write it yourself
        </Button>
        <p className="text-xs text-muted-foreground">Nothing is sent until you press Send.</p>
      </div>
    </div>
  );
}
