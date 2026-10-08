"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { authFetch } from "./client";
import { ApiError, errorMessage, type Problem } from "./errors";
import type { AskRef } from "./types";

/* Streamed AI answers: POST a question, read server-sent events (`delta` {text} …, then `done` or `error`). */

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Incremental SSE parser. Feed it decoded text in any chunk sizes; it returns the complete events so far.
 * Handles \n, \r\n and \r line endings (sse-starlette sends \r\n), comments (": ping") and multi-line data.
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string, flush = false): SseEvent[] => {
    buffer += chunk;
    // A trailing \r may be the first half of a \r\n split across chunks; keep it for the next round.
    const held = !flush && buffer.endsWith("\r") ? "\r" : "";
    const text = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n");
    const blocks = text.split("\n\n");
    buffer = (flush ? "" : blocks.pop() ?? "") + held;
    const events: SseEvent[] = [];
    for (const block of blocks) {
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) events.push({ event, data: data.join("\n") });
    }
    return events;
  };
}

/** Error raised from an `error` event in the stream (the answer started but couldn't finish). */
class StreamError extends ApiError {
  constructor(message: string) {
    super(502, { code: "stream_error", detail: message });
  }
}

async function problemOf(response: Response): Promise<Problem> {
  try {
    const body = (await response.json()) as Problem & { message?: unknown };
    if (body && typeof body === "object") {
      // Some errors carry `message` instead of `detail`.
      if (!body.detail && typeof body.message === "string") return { ...body, detail: body.message };
      return body;
    }
  } catch {
    // Not JSON: fall back to the generic message for the status.
  }
  return {};
}

/**
 * POST `body` as JSON to a streaming endpoint with the session's bearer token (refreshing once on a 401, like
 * every other API call) and call `onEvent` for each server-sent event. Resolves when the stream ends; throws
 * an ApiError for a JSON error response, or an AbortError when `signal` is aborted.
 */
export async function postStream(
  url: string,
  body: unknown,
  { signal, onEvent }: { signal: AbortSignal; onEvent: (event: SseEvent) => void },
): Promise<void> {
  const request = new Request(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  let response: Response;
  try {
    response = await authFetch(request);
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0);
  }
  if (!response.ok) throw new ApiError(response.status, await problemOf(response));
  if (!response.body) throw new ApiError(502);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parse = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      for (const event of parse(value ?? "", done)) onEvent(event);
      if (done) return;
    }
  } catch (err) {
    if (signal.aborted || err instanceof ApiError) throw err;
    throw new ApiError(0);
  } finally {
    reader.releaseLock();
  }
}

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export type StreamOutcome =
  | { status: "done"; text: string; refs: AskRef[] }
  | { status: "stopped"; text: string }
  | { status: "error"; text: string; error: string };

function parseJson(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * One streamed answer at a time from `url`. `text` grows as deltas arrive; `start` resolves with how it ended
 * (done, stopped or error), so callers can record a finished turn. Starting again or unmounting aborts the
 * answer in flight.
 */
/**
 * How many characters to reveal this frame: a steady typing pace, catching up faster when the model
 * (or Azure's content filter, which releases text in bursts) sends a lot at once.
 */
function revealStep(backlog: number) {
  return Math.max(2, Math.ceil(backlog / 40));
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function useStreamingAnswer<Body>(url: string) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<AskRef[]>([]);
  const [stopped, setStopped] = useState(false);
  const controller = useRef<AbortController | null>(null);
  // Each start or reset begins a new run; a run that is no longer current never touches state.
  const runs = useRef(0);
  // Smooth reveal: `received` is what has arrived, `shown` how much of it is on screen.
  const received = useRef("");
  const shown = useRef(0);
  const frame = useRef<number | null>(null);
  const drained = useRef<(() => void) | null>(null);

  const stopRequested = useRef(false);

  const reveal = useCallback(() => {
    if (frame.current !== null) return;
    const step = () => {
      frame.current = null;
      const target = received.current;
      if (shown.current < target.length) {
        shown.current = prefersReducedMotion()
          ? target.length
          : Math.min(target.length, shown.current + revealStep(target.length - shown.current));
        setText(target.slice(0, shown.current));
      }
      if (shown.current < target.length) {
        frame.current = requestAnimationFrame(step);
      } else {
        drained.current?.();
        drained.current = null;
      }
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  /** Resolves once everything received is on screen. */
  const untilShown = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (shown.current >= received.current.length) return resolve();
        drained.current = resolve;
        reveal();
      }),
    [reveal],
  );

  const halt = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drained.current?.();
    drained.current = null;
  }, []);

  useEffect(
    () => () => {
      controller.current?.abort();
      halt();
    },
    [halt],
  );

  const stop = useCallback(() => {
    // Also stops the typing-out after the network stream has ended.
    stopRequested.current = true;
    controller.current?.abort();
    halt();
  }, [halt]);

  const reset = useCallback(() => {
    runs.current += 1;
    controller.current?.abort();
    controller.current = null;
    halt();
    received.current = "";
    shown.current = 0;
    stopRequested.current = false;
    setText("");
    setStatus("idle");
    setError(null);
    setRefs([]);
    setStopped(false);
  }, [halt]);

  const start = useCallback(
    async (body: Body): Promise<StreamOutcome> => {
      controller.current?.abort();
      const ctl = new AbortController();
      controller.current = ctl;
      const run = ++runs.current;
      const live = () => runs.current === run;
      halt();
      received.current = "";
      shown.current = 0;
      stopRequested.current = false;
      setText("");
      setStatus("streaming");
      setError(null);
      setRefs([]);
      setStopped(false);

      let acc = "";
      let ended: StreamOutcome | null = null;
      const fail = (message: string): StreamOutcome => {
        if (live()) {
          setError(message);
          setStatus("error");
        }
        return { status: "error", text: acc, error: message };
      };

      try {
        await postStream(url, body, {
          signal: ctl.signal,
          onEvent: ({ event, data }) => {
            if (ended || !live()) return;
            const payload = parseJson(data);
            if (event === "delta" && typeof payload.text === "string") {
              acc += payload.text;
              received.current = acc;
              reveal();
            } else if (event === "done") {
              const cited = Array.isArray(payload.refs) ? (payload.refs as AskRef[]) : [];
              ended = { status: "done", text: acc, refs: cited };
            } else if (event === "error") {
              const message = typeof payload.message === "string" && payload.message ? payload.message : null;
              throw new StreamError(message ?? "The AI couldn't answer just now. Try again.");
            }
          },
        });
      } catch (err) {
        if (ctl.signal.aborted) {
          // Stop keeps exactly what's on screen.
          halt();
          const kept = received.current.slice(0, shown.current);
          if (live()) {
            received.current = kept;
            setText(kept);
            setStopped(true);
            setStatus(kept ? "done" : "idle");
          }
          return { status: "stopped", text: kept };
        }
        ctl.abort();
        return fail(errorMessage(err));
      } finally {
        if (controller.current === ctl) controller.current = null;
      }
      // `ended` is set inside the event callback, which TypeScript's narrowing can't see.
      const outcome = ended as StreamOutcome | null;
      if (!outcome) return fail("The answer was cut off. Try again.");
      await untilShown(); // finish typing out what arrived before calling it done
      if (!live()) return { status: "stopped", text: received.current.slice(0, shown.current) };
      if (stopRequested.current || ctl.signal.aborted) {
        const kept = received.current.slice(0, shown.current);
        setText(kept);
        setStopped(true);
        setStatus(kept ? "done" : "idle");
        return { status: "stopped", text: kept };
      }
      if (live() && outcome.status === "done") {
        setRefs(outcome.refs);
        setStatus("done");
      }
      return outcome;
    },
    [url, halt, reveal, untilShown],
  );

  return { text, status, error, refs, stopped, start, stop, reset };
}
