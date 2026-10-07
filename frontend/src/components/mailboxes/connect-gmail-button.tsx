"use client";

import { Mail, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useGmailAuthorize } from "@/lib/api/queries";

export function useStartGmailConnect() {
  const authorize = useGmailAuthorize();
  return {
    start: (opts: { loginHint?: string; send?: boolean } = {}) =>
      authorize.mutate(opts, {
        onSuccess: ({ url }) => {
          window.location.href = url;
        },
      }),
    pending: authorize.isPending || authorize.isSuccess,
  };
}

/** The Gmail step of "Add a mailbox": explain what we ask Google for, then hand over to Google. */
export function GmailConnectPanel({ onBack }: { onBack: () => void }) {
  const { start, pending } = useStartGmailConnect();
  const [send, setSend] = useState(true);
  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You&apos;ll sign in with Google and say yes. After that, Gmail tells us the moment a new email arrives.
        </p>
        <p className="flex gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            <span className="font-medium">We only read new email</span>
            <span className="text-muted-foreground"> to see if it&apos;s important. We never change or delete anything.</span>
          </span>
        </p>
        <label className="flex cursor-pointer gap-3 rounded-xl border p-3 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-accent/60">
          <Checkbox checked={send} onCheckedChange={(v) => setSend(v === true)} className="mt-0.5" />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Send className="size-3.5" aria-hidden /> Also let me send email from WhatsApp
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Write an email on WhatsApp and send it from this address. Nothing goes out until you reply YES.
            </span>
          </span>
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => start({ send })} disabled={pending}>
          {pending ? <Spinner /> : <Mail />} Continue to Google
        </Button>
      </DialogFooter>
    </>
  );
}
