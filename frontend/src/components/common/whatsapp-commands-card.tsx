"use client";

import { ChevronDown, Lightbulb, MessageCircle } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const MAIN: { command: string; description: string }[] = [
  { command: "/open K7", description: "Show that email again, with links" },
  { command: "/remind K7 2h", description: "Remind me later: 2h, tonight, tomorrow 9am" },
  { command: "/reply K7", description: "Reply from WhatsApp. With AI on: pick 1-3 or describe it" },
  { command: "/mute K7", description: "No more alerts from that sender" },
];

const MORE: { command: string; description: string }[] = [
  { command: "/recent", description: "Your latest important emails" },
  { command: "/upcoming", description: "Exams, interviews and due dates coming up" },
  { command: "/muted", description: "Senders you muted (undo with /unmute)" },
  { command: "/email", description: "Write and send an email (/email <template>)" },
  { command: "/write …", description: "AI drafts a new email" },
  { command: "/edit …", description: "Change the AI draft" },
  { command: "/ask …", description: "Ask about your mail" },
  { command: "/help", description: "Every command" },
];

function CommandList({ items }: { items: typeof MAIN }) {
  return (
    <dl className="divide-y rounded-xl border bg-background/50 text-sm">
      {items.map((c) => (
        <div key={c.command} className="grid grid-cols-1 gap-0.5 px-3 py-2.5 min-[420px]:grid-cols-[7.5rem_1fr] min-[420px]:gap-3">
          <dt>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] font-medium">{c.command}</code>
          </dt>
          <dd className="text-muted-foreground">{c.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cheat-sheet for the WhatsApp bot. "K7" stands for the short code shown on each alert. */
export function WhatsAppCommandsCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-wa" aria-hidden /> Reply to alerts on WhatsApp
        </CardTitle>
        <CardDescription>
          Every alert has a short code like <span className="font-mono font-medium text-foreground">#K7</span>. Send
          these messages to the MailSentinel chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <CommandList items={MAIN} />
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent className="pb-3">
            <CommandList items={MORE} />
          </CollapsibleContent>
          <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {open ? "Show fewer" : "More commands"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
        </Collapsible>
        <p className="flex gap-2 rounded-xl bg-secondary/70 px-3 py-2.5 text-xs text-secondary-foreground">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            Easier still: reply to an alert and just type <em className="font-medium">remind 2h</em>,{" "}
            <em className="font-medium">open</em> or <em className="font-medium">mute</em>. No code needed.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
