"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AskEmail } from "./ask-email";
import { ReplyPanel } from "./reply-with-ai";

export type AssistantTab = "ask" | "reply";

/**
 * The Assistant beside an email: Ask about it, or Reply to it (AI or by hand) and send, all on the page.
 * With AI off only Reply shows, without its AI parts. `focusReply` changes when the page's Reply button
 * is pressed: the card scrolls into view and the reply box gets focus.
 */
export function EmailAssistant({
  messageId,
  aiAvailable,
  tab,
  onTabChange,
  focusReply,
  className,
}: {
  messageId: string;
  aiAvailable: boolean;
  tab: AssistantTab;
  onTabChange: (tab: AssistantTab) => void;
  focusReply: number;
  className?: string;
}) {
  const card = useRef<HTMLElement>(null);
  const reply = useRef<HTMLDivElement>(null);
  const active: AssistantTab = aiAvailable ? tab : "reply";
  // Reply mounts on first visit (its ideas cost an AI call), then stays mounted so a draft survives tab switches.
  const [replyOpened, setReplyOpened] = useState(active === "reply");
  if (active === "reply" && !replyOpened) setReplyOpened(true);

  useEffect(() => {
    if (!focusReply) return;
    const frame = requestAnimationFrame(() => {
      const el = card.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Type straight away with a mouse; on touch, focus the tab so the keyboard doesn't cover the options.
      const typing = window.matchMedia("(pointer: fine)").matches;
      const target = typing ? reply.current?.querySelector<HTMLElement>("[data-reply-focus]") : null;
      (target ?? el.querySelector<HTMLElement>("[data-assistant-reply-tab]") ?? reply.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusReply]);

  const title = (
    <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <Sparkles className="size-4 text-brand-ink" aria-hidden /> {aiAvailable ? "Assistant" : "Reply"}
    </h2>
  );

  return (
    <section
      ref={card}
      aria-label="Assistant"
      className={cn("flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border bg-card", className)}
    >
      <Tabs
        value={active}
        onValueChange={(v) => onTabChange(v as AssistantTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          {title}
          {aiAvailable ? (
            <TabsList aria-label="Assistant">
              <TabsTrigger value="ask" className="px-3">
                Ask
              </TabsTrigger>
              <TabsTrigger value="reply" className="px-3" data-assistant-reply-tab>
                Reply
              </TabsTrigger>
            </TabsList>
          ) : null}
        </div>
        {aiAvailable ? (
          <TabsContent value="ask" forceMount className="flex min-h-0 flex-col data-[state=inactive]:hidden">
            <AskEmail messageId={messageId} />
          </TabsContent>
        ) : null}
        <TabsContent
          value="reply"
          forceMount
          ref={reply}
          tabIndex={-1}
          className="min-h-0 overflow-y-auto px-4 py-4 data-[state=inactive]:hidden"
        >
          {replyOpened ? <ReplyPanel messageId={messageId} aiAvailable={aiAvailable} /> : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
