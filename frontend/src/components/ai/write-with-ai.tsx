"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAiAvailable, useComposeDraft } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import { DraftEditor } from "./draft-editor";

function WriteForm({ onClose }: { onClose: () => void }) {
  const compose = useComposeDraft();
  const [prompt, setPrompt] = useState("");

  if (compose.data) {
    return <DraftEditor draft={compose.data} onSent={onClose} onDiscard={onClose} />;
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim()) compose.mutate(prompt.trim());
      }}
    >
      <Field>
        <FieldLabel htmlFor="write-ai-prompt">Who is it to, and what should it say?</FieldLabel>
        <Textarea
          id="write-ai-prompt"
          rows={3}
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Email hr@example.com: I accept the offer and can join on 1 March"
          disabled={compose.isPending}
          autoFocus
        />
      </Field>
      {compose.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(compose.error)}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!prompt.trim() || compose.isPending}>
          {compose.isPending ? <Spinner /> : <Sparkles />}
          {compose.isPending ? "Writing…" : "Write draft"}
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is sent until you press Send.</span>
      </div>
    </form>
  );
}

/** "Write with AI" button plus its dialog. Renders nothing when AI isn't available. */
export function WriteWithAiButton({ label = "Write with AI", className }: { label?: string; className?: string }) {
  const available = useAiAvailable();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className={className}>
        <Sparkles /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Write with AI</DialogTitle>
            <DialogDescription>Describe the email. You can edit the draft before sending.</DialogDescription>
          </DialogHeader>
          {open ? <WriteForm onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
