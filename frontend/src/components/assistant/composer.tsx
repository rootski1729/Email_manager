"use client";

import { ArrowUp, Plus, Square } from "lucide-react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export const MAX_MESSAGE = 2000;

/**
 * The chat's message box, kept at the bottom of the window. Enter sends and Shift+Enter starts a new line;
 * while the assistant answers, the send button becomes Stop.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onNewChat,
  answering,
  canStartOver,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onNewChat: () => void;
  answering: boolean;
  /** There is a conversation to clear. */
  canStartOver: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
}) {
  const ready = value.trim().length >= 2;
  return (
    <div className="sticky bottom-(--mobile-nav-h) z-20 -mx-4 bg-background/90 px-4 pt-2 pb-3 backdrop-blur-md md:bottom-0 md:-mx-8 md:px-8 md:pb-5">
      {/* A short fade above, so the conversation slips under the box instead of being cut off. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background/90 to-transparent" />
      <form
        className="mx-auto max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!answering) onSend();
        }}
      >
        <InputGroup className="h-auto items-end rounded-2xl bg-card shadow-xs hover:border-(--lift-border) dark:bg-card">
          <InputGroupTextarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!answering) onSend();
              }
            }}
            rows={1}
            maxLength={MAX_MESSAGE}
            placeholder={answering ? "Answering…" : "Describe the email, or ask a follow-up…"}
            aria-label="Message the assistant"
            className="max-h-40 min-h-11 overflow-y-auto py-3 pl-4 text-base md:text-sm"
          />
          <InputGroupAddon align="inline-end" className="pb-2">
            {/*
              Distinct keys: Stop and Send must be different elements. Stopping settles the answer while the click is
              still being handled, and a reused <button> would by then be the submit button and send again.
            */}
            {answering ? (
              <InputGroupButton
                key="stop"
                type="button"
                variant="secondary"
                size="sm"
                onClick={onStop}
                aria-label="Stop answering"
                className="h-8 rounded-lg px-3"
              >
                <Square className="size-2.5 fill-current" aria-hidden /> Stop
              </InputGroupButton>
            ) : (
              <InputGroupButton
                key="send"
                type="submit"
                variant={ready ? "default" : "secondary"}
                size="icon-sm"
                aria-label="Send message"
                // Not `disabled`: a disabled control greys the whole input group. Empty messages are ignored.
                aria-disabled={!ready || undefined}
                className={cn(!ready && "text-muted-foreground hover:text-muted-foreground")}
              >
                <ArrowUp aria-hidden />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
        <div className="mt-1.5 flex min-h-6 items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">Nothing is sent without you pressing Send.</p>
          {canStartOver ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onNewChat}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Plus aria-hidden /> New chat
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
