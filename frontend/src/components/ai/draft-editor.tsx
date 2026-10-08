"use client";

import { Send, Wand2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useReviseDraft, useSendEmail } from "@/lib/api/ai";
import { errorMessage } from "@/lib/api/errors";
import type { Draft } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function addresses(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

interface Fields {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

function fieldsOf(d: Draft): Fields {
  return { to: d.to.join(", "), cc: d.cc.join(", "), subject: d.subject, body: d.body };
}

/**
 * A draft the user edits, revises with AI and sends. Nothing is sent until Send is pressed.
 * Used by the Assistant's Reply tab on a message and by "Write with AI".
 */
export function DraftEditor({
  draft,
  onSent,
  onDiscard,
  handwritten = false,
  canRevise = true,
  notify = true,
}: {
  draft: Draft;
  onSent: () => void;
  onDiscard: () => void;
  /** An empty draft to write by hand: the body gets focus, and "Change it…" waits until there's text. */
  handwritten?: boolean;
  /** False when AI is off: no "Change it…". */
  canRevise?: boolean;
  /** Show the "Sending…" toast (off when the caller shows its own sent state). */
  notify?: boolean;
}) {
  const id = useId();
  const [base, setBase] = useState(draft);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(draft));
  const [change, setChange] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const revise = useReviseDraft();
  const send = useSendEmail();
  const busy = revise.isPending || send.isPending;
  const showCc = base.cc.length > 0 || fields.cc.trim() !== "";
  const showChange = canRevise && (!handwritten || fields.body.trim() !== "");

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value }));

  function submitChange() {
    const instructions = change.trim();
    if (!instructions || busy) return;
    setProblem(null);
    revise.mutate(
      {
        to: addresses(fields.to),
        cc: addresses(fields.cc),
        subject: fields.subject,
        body: fields.body,
        reply_to_message_id: base.reply_to_message_id ?? null,
        instructions,
      },
      {
        onSuccess: (next) => {
          setBase(next);
          setFields(fieldsOf(next));
          setChange("");
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  }

  function submitSend() {
    const to = addresses(fields.to);
    if (to.length === 0) {
      setProblem("Add who it goes to.");
      return;
    }
    if (!fields.body.trim()) {
      setProblem("The email is empty.");
      return;
    }
    setProblem(null);
    send.mutate(
      {
        mailbox_id: base.mailbox_id,
        to,
        cc: addresses(fields.cc),
        bcc: [],
        subject: fields.subject.trim(),
        body: fields.body,
        reply_to_message_id: base.reply_to_message_id ?? null,
      },
      {
        onSuccess: () => {
          if (!notify) {
            onSent();
            return;
          }
          toast("Sending…", {
            description: (
              <Link href="/sent" className="underline underline-offset-2">
                See it in Sent
              </Link>
            ),
          });
          onSent();
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        From <span className="font-medium text-foreground">{base.from_address}</span>
      </p>
      <Field>
        <FieldLabel htmlFor={`${id}-to`}>To</FieldLabel>
        <Input id={`${id}-to`} value={fields.to} onChange={(e) => set("to", e.target.value)} spellCheck={false} disabled={busy} />
      </Field>
      {showCc ? (
        <Field>
          <FieldLabel htmlFor={`${id}-cc`}>Cc</FieldLabel>
          <Input id={`${id}-cc`} value={fields.cc} onChange={(e) => set("cc", e.target.value)} spellCheck={false} disabled={busy} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-subject`}>Subject</FieldLabel>
        <Input id={`${id}-subject`} value={fields.subject} maxLength={500} onChange={(e) => set("subject", e.target.value)} disabled={busy} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-body`}>Email</FieldLabel>
        <Textarea
          id={`${id}-body`}
          rows={8}
          maxLength={20000}
          value={fields.body}
          onChange={(e) => set("body", e.target.value)}
          disabled={busy}
          autoFocus={handwritten}
          placeholder={handwritten ? "Write your reply…" : undefined}
          className="min-h-40"
        />
      </Field>

      {showChange ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitChange();
          }}
        >
          <InputGroup>
            <InputGroupAddon>
              <Wand2 />
            </InputGroupAddon>
            <InputGroupInput
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="Change it… e.g. shorter, more formal"
              aria-label="Ask the AI to change the draft"
              maxLength={2000}
              disabled={busy}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={busy} className={cn(!change.trim() && "text-muted-foreground/60")}>
                {revise.isPending ? <Spinner /> : null} Change
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      ) : null}

      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submitSend} disabled={busy}>
          {send.isPending ? <Spinner /> : <Send />} Send
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={send.isPending}>
          Discard
        </Button>
        <span className="text-xs text-muted-foreground">Check it first. It goes out from your own mailbox.</span>
      </div>
    </div>
  );
}
