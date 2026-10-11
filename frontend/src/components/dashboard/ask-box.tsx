"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useAiAvailable } from "@/lib/api/ai";
import { cn } from "@/lib/utils";

/**
 * "Ask about your mail": one question in, answered in the Assistant (/assistant?q=…), which can search every
 * mailbox, ask follow-ups and open or reply. `compact` fits it inside a card (the mail list's Assistant).
 */
export function AskBox({ compact = false }: { compact?: boolean }) {
  const available = useAiAvailable();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  if (!available) return null;

  const ready = question.trim().length >= 2;

  return (
    <section aria-label="Ask about your mail">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          if (q.length >= 2) router.push(`/assistant?q=${encodeURIComponent(q.slice(0, 500))}`);
        }}
      >
        <InputGroup
          className={cn(
            "hover:border-(--lift-border)",
            !compact && "h-12 bg-card pl-1 shadow-xs dark:bg-card",
          )}
        >
          {compact ? null : (
            <InputGroupAddon>
              <Sparkles className="size-[18px] text-brand-ink" aria-hidden />
            </InputGroupAddon>
          )}
          <InputGroupInput
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={compact ? "e.g. The email about the API" : "Ask about your mail, e.g. Find the email about the API"}
            aria-label="Ask about your mail"
            maxLength={500}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              // Iris once there's a question to send; a quiet chip until then. Empty questions are ignored anyway,
              // so the button never looks disabled.
              variant={ready ? "default" : compact ? "ghost" : "secondary"}
              aria-disabled={!ready || undefined}
              className={cn(
                compact ? "h-7 rounded-lg px-2.5" : "h-8 rounded-lg px-3.5",
                !ready && "text-muted-foreground hover:text-muted-foreground",
              )}
            >
              Ask
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </section>
  );
}
