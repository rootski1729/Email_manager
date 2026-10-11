"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MailOpen, PenLine, RotateCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { AnswerMarkdown } from "@/components/ai/answer-markdown";
import { DraftEditor } from "@/components/ai/draft-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { aiStatusQuery } from "@/lib/api/ai";
import {
  ASSISTANT_CHAT_URL,
  type AssistantChatBody,
  type AssistantOpened,
  type AssistantResult,
  draftOf,
  endConversation,
  openedOf,
  resultsOf,
  useOpenResult,
} from "@/lib/api/assistant";
import { errorMessage } from "@/lib/api/errors";
import { type StreamPayload, useStreamingAnswer } from "@/lib/api/stream";
import type { AskRef, Draft } from "@/lib/api/types";
import { Composer, MAX_MESSAGE } from "./composer";
import { ResultList } from "./result-card";

const EXAMPLES = [
  "The email where Abhi and I discussed the API",
  "My flight booking from last month",
  "Invoices with a PDF attached",
  "What did Riya say about the interview?",
];

/** A finished exchange: what the person said and everything the assistant answered with. */
interface Turn {
  id: number;
  message: string;
  answer: string;
  results: AssistantResult[];
  opened: AssistantOpened[];
  draft: Draft | null;
  draftState: "open" | "sent" | "discarded";
  stopped: boolean;
}

/** The exchange in progress (or one that failed, kept with Retry). */
interface Pending {
  id: number;
  message: string;
  /** Latest `status` text, e.g. "Searching your mail: from abhi". */
  status: string | null;
  results: AssistantResult[];
  /** The `results` shown are the final list (not just what the search found along the way). */
  finalResults: boolean;
  error: { message: string; code: string } | null;
}

/* The chat survives a refresh (and Back from an opened email) for as long as the tab is open. */
const STORE_KEY = "mailsentinel.assistant";
const KEEP_TURNS = 30;

interface Saved {
  conversationId: string | null;
  turns: Turn[];
}

function load(): Saved {
  const empty: Saved = { conversationId: null, turns: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as Partial<Saved>;
    return {
      conversationId: typeof data.conversationId === "string" ? data.conversationId : null,
      turns: Array.isArray(data.turns) ? data.turns.filter((t) => t && typeof t.id === "number") : [],
    };
  } catch {
    return empty;
  }
}

function save(state: Saved) {
  try {
    if (!state.conversationId && !state.turns.length) window.sessionStorage.removeItem(STORE_KEY);
    else window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ ...state, turns: state.turns.slice(-KEEP_TURNS) }));
  } catch {
    // Storage blocked or full: the chat just won't survive a refresh.
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-pretty break-words text-accent-foreground">
        <span className="sr-only">You: </span>
        {text}
      </p>
    </div>
  );
}

/** The assistant's side of a turn: a small iris mark beside left-aligned plain text. */
function AssistantSide({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-full bg-tint-iris text-tint-iris-ink sm:flex"
      >
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3" aria-live={live ? "polite" : undefined}>
        <span className="sr-only">Assistant: </span>
        {children}
      </div>
    </div>
  );
}

function StatusLine({ text }: { text: string | null }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground" role="status">
      <Spinner className="size-3.5 shrink-0 text-brand-ink" aria-hidden />
      <span className="min-w-0 truncate">{text ?? "Thinking…"}</span>
    </p>
  );
}

function OpenedLinks({ opened }: { opened: AssistantOpened[] }) {
  if (!opened.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {opened.map((o) => (
        <Link
          key={o.message_id}
          href={`/messages/${o.message_id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm text-accent-foreground outline-none transition-colors hover:bg-brand/15 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MailOpen className="size-3.5" aria-hidden />
          Opened{o.code ? <span className="font-mono font-semibold">#{o.code}</span> : null}
          <span aria-hidden>·</span>
          <span className="font-medium underline underline-offset-2">View</span>
        </Link>
      ))}
    </div>
  );
}

function DraftBlock({
  draft,
  state,
  canRevise,
  onSent,
  onDiscard,
}: {
  draft: Draft;
  state: Turn["draftState"];
  canRevise: boolean;
  onSent: () => void;
  onDiscard: () => void;
}) {
  if (state === "discarded") return <p className="text-xs text-muted-foreground">Draft discarded.</p>;
  if (state === "sent") {
    return (
      <p className="flex animate-rise flex-wrap items-center gap-x-2 rounded-2xl bg-card px-4 py-3 text-sm shadow-xs ring-1 ring-border" role="status">
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
    );
  }
  return (
    <section aria-label="Reply draft" className="animate-rise rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border sm:p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-tint-iris text-tint-iris-ink">
          <PenLine className="size-3.5" aria-hidden />
        </span>
        Reply draft
      </p>
      <DraftEditor draft={draft} canRevise={canRevise} notify={false} onSent={onSent} onDiscard={onDiscard} />
    </section>
  );
}

function ErrorLine({ error, onRetry }: { error: { message: string; code: string }; onRetry: () => void }) {
  if (error.code === "ai_unavailable") {
    return (
      <p role="alert" className="text-sm text-muted-foreground text-pretty">
        The assistant needs AI, which is switched off for your account right now.{" "}
        <Link href="/settings" className="font-medium text-brand-ink underline-offset-2 hover:underline">
          Check Settings
        </Link>
      </p>
    );
  }
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-destructive">
      <span>{error.message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-md font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RotateCw className="size-3.5" aria-hidden /> Retry
      </button>
    </p>
  );
}

function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <span className="flex size-12 animate-rise items-center justify-center rounded-2xl bg-tint-iris text-tint-iris-ink">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <h1 className="greeting-wash mt-5 animate-rise text-2xl font-semibold tracking-tight text-balance sm:text-[1.7rem]">
        Find any email by describing it
      </h1>
      <p className="mt-2 max-w-md animate-rise text-[0.95rem] text-muted-foreground text-pretty">
        I search all your connected mailboxes. Tell me who, roughly when, or what it was about.
      </p>
      <ul aria-label="Examples" className="stagger mt-7 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <li key={example} className="flex">
            <button
              type="button"
              onClick={() => onPick(example)}
              className="lift group flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left text-sm shadow-xs ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1 text-pretty">{example}</span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-ink"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Unavailable({ configured }: { configured: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="max-w-md animate-rise rounded-2xl bg-card p-6 text-center shadow-xs ring-1 ring-border">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-tint-iris text-tint-iris-ink">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">The assistant is resting</h1>
        <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
          {configured
            ? "Finding emails by describing them uses AI, which is switched off for your account. You can turn it on in Settings."
            : "Finding emails by describing them uses AI, which isn't set up yet. Your admin can switch it on."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings">Go to Settings</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The mail Assistant: describe an email, narrow it down with follow-ups, then open it or reply. Each turn shows
 * the assistant's answer with numbered result cards, an inline reply draft, or links to the emails it opened.
 */
export function AssistantView() {
  const router = useRouter();
  const params = useSearchParams();
  const aiStatus = useQuery(aiStatusQuery);
  const [saved] = useState(load);
  const [conversationId, setConversationId] = useState<string | null>(saved.conversationId);
  const [turns, setTurns] = useState<Turn[]>(saved.turns);
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const [opening, setOpening] = useState<{ turn: number; n: number } | null>(null);
  const openResult = useOpenResult();

  // Mirrors for the async send loop (state in its closure would be stale).
  const conversationRef = useRef(saved.conversationId);
  const pendingRef = useRef<Pending | null>(null);
  const nextId = useRef(saved.turns.reduce((max, t) => Math.max(max, t.id), 0) + 1);
  /** Bumped by New chat, so an answer cut short by it isn't added back afterwards. */
  const epoch = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);

  const setConversation = useCallback((id: string | null) => {
    conversationRef.current = id;
    setConversationId(id);
  }, []);

  const updatePending = useCallback((fn: (p: Pending) => Pending | null) => {
    const current = pendingRef.current;
    const next = current ? fn(current) : null;
    pendingRef.current = next;
    setPending(next);
  }, []);

  const onEvent = useCallback(
    (event: string, data: StreamPayload) => {
      if (event === "conversation" && typeof data.conversation_id === "string") {
        setConversation(data.conversation_id);
      } else if (event === "status" && typeof data.text === "string") {
        const status = data.text;
        updatePending((p) => ({ ...p, status }));
      } else if (event === "results") {
        const results = resultsOf(data);
        const final = data.final === true;
        updatePending((p) => (p.finalResults && !final ? p : { ...p, results, finalResults: final }));
      }
    },
    [setConversation, updatePending],
  );

  const stream = useStreamingAnswer<AssistantChatBody>(ASSISTANT_CHAT_URL, { onEvent });
  const answering = stream.status === "streaming";

  useEffect(() => save({ conversationId, turns }), [conversationId, turns]);

  async function send(raw: string) {
    const message = raw.trim().slice(0, MAX_MESSAGE);
    if (message.length < 2 || pendingRef.current?.error === null) return; // empty, or already answering
    const id = nextId.current++;
    const started = epoch.current;
    const fresh: Pending = { id, message, status: null, results: [], finalResults: false, error: null };
    pendingRef.current = fresh;
    setPending(fresh);
    setText((t) => (t.trim() === message ? "" : t));

    const outcome = await stream.start({ message, conversation_id: conversationRef.current });
    const current = pendingRef.current;
    if (epoch.current !== started || current?.id !== id) return;

    if (outcome.status === "error") {
      updatePending((p) => ({ ...p, error: { message: outcome.error, code: outcome.code } }));
      return;
    }
    if (outcome.status === "stopped" && !outcome.text.trim() && !current.results.length) {
      // Stopped before anything arrived: drop the turn and give the message back.
      updatePending(() => null);
      setText((t) => t || message);
      stream.reset();
      return;
    }
    const data = outcome.status === "done" ? outcome.data : {};
    const draft = draftOf(data);
    const opened = openedOf(data);
    if (typeof data.conversation_id === "string") setConversation(data.conversation_id);
    // Cards found along the way are dropped when the turn ended in an open or a draft (the server does the same).
    const results = current.finalResults || (!draft && !opened.length) ? current.results : [];
    setTurns((list) => [
      ...list,
      { id, message, answer: outcome.text, results, opened, draft, draftState: "open", stopped: outcome.status === "stopped" },
    ]);
    updatePending(() => null);
    stream.reset();
  }

  function submit() {
    if (answering) return;
    void send(text);
  }

  function retry() {
    const failed = pendingRef.current;
    if (!failed?.error) return;
    updatePending(() => null);
    void send(failed.message);
  }

  function clearChat() {
    epoch.current += 1;
    stream.reset();
    const id = conversationRef.current;
    if (id) void endConversation(id);
    setConversation(null);
    setTurns([]);
    updatePending(() => null);
    setOpening(null);
  }

  function newChat() {
    clearChat();
    setText("");
    input.current?.focus();
  }

  function setDraftState(turnId: number, draftState: Turn["draftState"]) {
    setTurns((list) => list.map((t) => (t.id === turnId ? { ...t, draftState } : t)));
  }

  function open(turnId: number, n: number) {
    const id = conversationRef.current;
    if (!id || opening) return;
    setOpening({ turn: turnId, n });
    openResult.mutate(
      { conversationId: id, n },
      {
        onSuccess: (opened) => router.push(`/messages/${opened.message_id}`),
        onError: (err) => {
          setOpening(null);
          toast.error(errorMessage(err));
        },
      },
    );
  }

  function replyTo(n: number) {
    const prompt = `Reply to ${n}: `;
    setText(prompt);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  }

  // From the dashboard's Ask box (or the mail list's Assistant): /assistant?q=… starts a new chat with it, once.
  const q = params.get("q");
  const askFromLink = useEffectEvent((question: string) => {
    router.replace("/assistant", { scroll: false });
    clearChat();
    void send(question);
  });
  useEffect(() => {
    if (!q) return;
    // Deferred a tick so React's dev double-mount doesn't send (and then abort) it twice.
    const timer = window.setTimeout(() => askFromLink(q), 0);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Follow the conversation: a new message scrolls to the end; growing content follows only if the reader is there.
  const pinned = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      pinned.current = window.innerHeight + window.scrollY >= el.scrollHeight - 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const toEnd = useCallback((smooth: boolean) => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }, []);
  const pendingId = pending?.id;
  useEffect(() => {
    if (pendingId === undefined) return;
    pinned.current = true;
    toEnd(true);
  }, [pendingId, toEnd]);
  useEffect(() => {
    if (pinned.current) toEnd(false);
  }, [stream.text, pending?.status, pending?.results, pending?.error, turns, toEnd]);

  if (aiStatus.isPending && !turns.length && !q) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 py-10" aria-busy>
        <Skeleton className="size-12 rounded-2xl" />
        <Skeleton className="h-7 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
    );
  }
  if (aiStatus.data && !aiStatus.data.available) {
    return <Unavailable configured={aiStatus.data.configured} />;
  }

  const empty = !turns.length && !pending;
  const canRevise = aiStatus.data?.available ?? true;
  const busyOpening = opening !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      {empty ? (
        <EmptyChat onPick={(example) => void send(example)} />
      ) : (
        <>
          <h1 className="sr-only">Assistant</h1>
          <ol className="flex-1 space-y-7 pb-8">
            {turns.map((t) => {
              const refs: AskRef[] = t.opened.map((o) => ({ message_id: o.message_id, ref: o.code, subject: "" }));
              return (
                <li key={t.id} className="space-y-3">
                  <UserBubble text={t.message} />
                  <AssistantSide>
                    {t.answer ? <AnswerMarkdown text={t.answer} refs={refs} /> : null}
                    {t.stopped ? <p className="text-xs text-muted-foreground">Stopped</p> : null}
                    <OpenedLinks opened={t.opened} />
                    <ResultList
                      results={t.results}
                      openingN={opening?.turn === t.id ? opening.n : null}
                      busy={busyOpening}
                      onOpen={(n) => open(t.id, n)}
                      onReply={replyTo}
                    />
                    {t.draft ? (
                      <DraftBlock
                        draft={t.draft}
                        state={t.draftState}
                        canRevise={canRevise}
                        onSent={() => setDraftState(t.id, "sent")}
                        onDiscard={() => setDraftState(t.id, "discarded")}
                      />
                    ) : null}
                  </AssistantSide>
                </li>
              );
            })}
            {pending ? (
              <li key={pending.id} className="space-y-3">
                <UserBubble text={pending.message} />
                <AssistantSide live>
                  {answering && !stream.text ? <StatusLine text={pending.status} /> : null}
                  {stream.text ? <AnswerMarkdown text={stream.text} streaming={answering} /> : null}
                  {pending.error ? <ErrorLine error={pending.error} onRetry={retry} /> : null}
                  <ResultList
                    results={pending.results}
                    openingN={opening?.turn === pending.id ? opening.n : null}
                    busy={busyOpening || answering}
                    onOpen={(n) => open(pending.id, n)}
                    onReply={replyTo}
                  />
                </AssistantSide>
              </li>
            ) : null}
          </ol>
        </>
      )}
      <Composer
        value={text}
        onChange={setText}
        onSend={submit}
        onStop={stream.stop}
        onNewChat={newChat}
        answering={answering}
        canStartOver={!empty || conversationId !== null}
        inputRef={input}
      />
    </div>
  );
}
