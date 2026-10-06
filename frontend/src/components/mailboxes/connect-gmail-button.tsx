"use client";

import { Mail, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export function ConnectGmailButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { start, pending } = useStartGmailConnect();
  const [send, setSend] = useState(true);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Mail /> Connect Gmail
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Gmail</DialogTitle>
          <DialogDescription>
            You&apos;ll sign in with Google and approve access. Gmail then tells MailSentinel the moment new mail arrives.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <span className="font-medium">Read your mail</span>
              <span className="text-muted-foreground"> — to check new emails against your rules. Nothing is changed or deleted.</span>
            </span>
          </li>
        </ul>
        <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5">
          <Checkbox checked={send} onCheckedChange={(v) => setSend(v === true)} className="mt-0.5" />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Send className="size-3.5" /> Also allow sending email from WhatsApp
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Lets you send email from this address with /email on WhatsApp. Every email waits for your YES before it goes out.
            </span>
          </span>
        </label>
        <DialogFooter>
          <Button onClick={() => start({ send })} disabled={pending}>
            {pending ? <Spinner /> : <Mail />} Continue to Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
