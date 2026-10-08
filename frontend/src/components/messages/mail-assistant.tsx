"use client";

import { Sparkles } from "lucide-react";

import { WriteWithAiButton } from "@/components/ai/write-with-ai";
import { AskBox } from "@/components/dashboard/ask-box";
import { useAiAvailable } from "@/lib/api/ai";
import { cn } from "@/lib/utils";

/** Slim Assistant beside the mail list (wide screens only): ask about all your mail, or write a new email. */
export function MailAssistant({ className }: { className?: string }) {
  const available = useAiAvailable();
  if (!available) return null;
  return (
    <aside aria-label="Assistant" className={cn("rounded-xl border bg-card", className)}>
      <h2 className="flex items-center gap-2 border-b px-4 py-3 text-base font-semibold tracking-tight">
        <Sparkles className="size-4 text-brand-ink" aria-hidden /> Assistant
      </h2>
      <div className="space-y-2.5 px-4 py-4">
        <p className="text-sm font-medium">Ask about your mail</p>
        <AskBox compact />
      </div>
      <div className="border-t px-4 py-4">
        <WriteWithAiButton label="Write a new email with AI" className="w-full" />
      </div>
    </aside>
  );
}
