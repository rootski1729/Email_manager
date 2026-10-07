"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAiAvailable, useRuleFromText } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { RuleIdea } from "@/lib/api/types";

/** "Describe what to watch": the AI fills in the form below; the user reviews and saves as usual. */
export function AiRuleBox({ onIdea }: { onIdea: (idea: RuleIdea) => void }) {
  const available = useAiAvailable();
  const suggest = useRuleFromText();
  const [text, setText] = useState("");
  if (!available) return null;

  return (
    <Card>
      <CardContent className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t.length >= 3 && !suggest.isPending) suggest.mutate(t, { onSuccess: onIdea });
          }}
        >
          <label htmlFor="ai-rule" className="mb-2 block text-sm font-medium">
            Describe what to watch
          </label>
          <InputGroup>
            <InputGroupAddon>
              <Sparkles />
            </InputGroupAddon>
            <InputGroupInput
              id="ai-rule"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Exam and fee mail from my college"
              maxLength={1000}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={text.trim().length < 3 || suggest.isPending}>
                {suggest.isPending ? <Spinner /> : null} Fill in
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        {suggest.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(suggest.error)}
          </p>
        ) : suggest.data ? (
          <p className="text-sm text-muted-foreground text-pretty">
            {suggest.data.explanation} Check the form below, then save.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">The AI fills in the form below for you to check. Nothing is saved yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
