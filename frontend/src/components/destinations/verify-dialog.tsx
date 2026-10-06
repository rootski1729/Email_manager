"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useResendDestinationCode, useVerifyDestination } from "@/lib/api/queries";
import type { Destination } from "@/lib/api/types";
import { chatIdToDisplay } from "@/lib/format";
import { useSecondTicker } from "@/lib/hooks/use-now";

export function VerifyDialog({
  destination,
  onOpenChange,
}: {
  destination: Destination | null;
  onOpenChange: (open: boolean) => void;
}) {
  const verify = useVerifyDestination();
  const resend = useResendDestinationCode();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => Math.floor(Date.now() / 1000) + 30);
  const now = useSecondTicker(Boolean(destination));
  const cooldown = Math.max(0, resendAt - now);

  function submit(value: string) {
    if (!destination || value.length !== 6) return;
    setError(null);
    verify.mutate(
      { id: destination.id, code: value },
      {
        onSuccess: (d) => {
          toast.success(`${d.label} verified`, { description: "Alerts can now be sent here." });
          onOpenChange(false);
        },
        onError: (err) => {
          setError(errorMessage(err));
          setCode("");
        },
      },
    );
  }

  return (
    <Dialog open={Boolean(destination)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Verify {destination?.label}</DialogTitle>
          <DialogDescription>
            We sent a 6-digit code on WhatsApp to{" "}
            <span className="font-medium text-foreground tabular">{destination ? chatIdToDisplay(destination.chat_id) : ""}</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          id="verify-form"
          className="flex flex-col items-center gap-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(code);
          }}
        >
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, ""))}
            onComplete={(v: string) => submit(v)}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Verification code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {error ? <FieldError className="text-center">{error}</FieldError> : null}
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={cooldown > 0 || resend.isPending || !destination}
            onClick={() =>
              destination &&
              resend.mutate(destination.id, {
                onSuccess: () => {
                  toast.success("New code sent");
                  setResendAt(Math.floor(Date.now() / 1000) + 30);
                },
              })
            }
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button type="submit" form="verify-form" disabled={verify.isPending || code.length !== 6}>
            {verify.isPending ? <Spinner /> : null}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
