"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Mail, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { imapPresetsQuery } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { CUSTOM, ImapConnectForm, PRESET_LABELS } from "./connect-imap-dialog";
import { GmailConnectPanel } from "./connect-gmail-button";

type Step = { kind: "choose" } | { kind: "gmail" } | { kind: "imap"; preset: string; other: boolean };

const CHOICES: { id: "gmail" | "outlook" | "yahoo" | "other"; label: string; hint: string; tile: string }[] = [
  { id: "gmail", label: "Gmail", hint: "One click with your Google account", tile: "bg-secondary text-muted-foreground" },
  { id: "outlook", label: "Outlook", hint: "Outlook, Hotmail, Microsoft 365", tile: "bg-secondary text-muted-foreground" },
  { id: "yahoo", label: "Yahoo", hint: "Yahoo Mail", tile: "bg-secondary text-muted-foreground" },
  { id: "other", label: "Other", hint: "Zoho, iCloud, work or school email…", tile: "bg-secondary text-muted-foreground" },
];

const TITLES: Record<string, string> = { outlook: "Add Outlook", yahoo: "Add Yahoo Mail" };

/** One "Add a mailbox" button → pick your provider → the shortest form that provider needs. */
export function AddMailboxDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const presets = useQuery({ ...imapPresetsQuery, enabled: open });
  const back = () => setStep({ kind: "choose" });

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setStep({ kind: "choose" });
  }

  const title =
    step.kind === "choose"
      ? "Add a mailbox"
      : step.kind === "gmail"
        ? "Add Gmail"
        : step.other
          ? "Add another mailbox"
          : (TITLES[step.preset] ?? `Add ${PRESET_LABELS[step.preset] ?? "a mailbox"}`);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {step.kind === "choose" ? (
            <DialogDescription>Where is your email? We&apos;ll only ask for what that provider needs.</DialogDescription>
          ) : null}
        </DialogHeader>
        {step.kind === "choose" ? (
          <ul className="grid gap-2">
            {CHOICES.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-3 lift rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() =>
                    setStep(
                      c.id === "gmail"
                        ? { kind: "gmail" }
                        : c.id === "other"
                          ? { kind: "imap", preset: CUSTOM, other: true }
                          : { kind: "imap", preset: c.id, other: false },
                    )
                  }
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", c.tile)}>
                    {c.id === "other" ? <MoreHorizontal className="size-5" aria-hidden /> : <Mail className="size-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-sm text-muted-foreground">{c.hint}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : step.kind === "gmail" ? (
          <GmailConnectPanel onBack={back} />
        ) : presets.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <ImapConnectForm
            key={step.preset}
            presets={presets.data ?? []}
            initialPreset={step.preset}
            allowPresetChoice={step.other}
            onBack={back}
            onDone={() => close(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddMailboxButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button onClick={onClick} className={className}>
      <Plus /> Add a mailbox
    </Button>
  );
}
