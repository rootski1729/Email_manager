"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useChangePassword } from "@/lib/admin/queries";

const MIN = 10;

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
    change.reset();
  };

  const tooShort = next.length > 0 && next.length < MIN;
  const mismatch = again.length > 0 && again !== next;
  const canSubmit = current.length > 0 && next.length >= MIN && again === next && !change.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change your password</DialogTitle>
          <DialogDescription>Use at least {MIN} characters. Other admins aren&apos;t affected.</DialogDescription>
        </DialogHeader>
        <form
          id="change-password"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            setError(null);
            change.mutate(
              { current_password: current, new_password: next },
              {
                onSuccess: () => {
                  toast.success("Password changed");
                  reset();
                  onOpenChange(false);
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cp-current">Current password</FieldLabel>
              <Input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field data-invalid={tooShort || undefined}>
              <FieldLabel htmlFor="cp-new">New password</FieldLabel>
              <Input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={next}
                aria-invalid={tooShort || undefined}
                onChange={(e) => setNext(e.target.value)}
              />
              {tooShort ? (
                <FieldError>At least {MIN} characters.</FieldError>
              ) : (
                <FieldDescription>A short sentence is easy to remember and hard to guess.</FieldDescription>
              )}
            </Field>
            <Field data-invalid={mismatch || undefined}>
              <FieldLabel htmlFor="cp-again">New password again</FieldLabel>
              <Input
                id="cp-again"
                type="password"
                autoComplete="new-password"
                value={again}
                aria-invalid={mismatch || undefined}
                onChange={(e) => setAgain(e.target.value)}
              />
              {mismatch ? <FieldError>The two passwords don&apos;t match.</FieldError> : null}
            </Field>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={change.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="change-password" disabled={!canSubmit}>
            {change.isPending ? <Spinner /> : null} Change password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
