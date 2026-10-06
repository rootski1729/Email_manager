"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { PhoneInput } from "@/components/auth/phone-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useAddDestination } from "@/lib/api/queries";
import type { Destination } from "@/lib/api/types";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/countries";

export function AddNumberDialog({ onAdded }: { onAdded: (d: Destination) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useAddDestination();

  function reset() {
    setLabel("");
    setRaw("");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add number
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a WhatsApp number</DialogTitle>
          <DialogDescription>We&apos;ll send a code to confirm the number belongs to someone who wants these alerts.</DialogDescription>
        </DialogHeader>
        <form
          id="add-number"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const phone = toE164(country, raw);
            if (!label.trim()) return setError("Give this number a label.");
            if (!phone) return setError("Enter a valid number with its country code.");
            setError(null);
            add.mutate(
              { phone, label: label.trim() },
              {
                onSuccess: (d) => {
                  setOpen(false);
                  reset();
                  onAdded(d);
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="dest-label">Label</FieldLabel>
              <Input id="dest-label" value={label} maxLength={120} placeholder="Mum, Work phone…" onChange={(e) => setLabel(e.target.value)} autoFocus />
            </Field>
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor="dest-phone">WhatsApp number</FieldLabel>
              <PhoneInput id="dest-phone" country={country} onCountryChange={setCountry} value={raw} onChange={setRaw} invalid={Boolean(error)} />
              <FieldDescription>The number must have WhatsApp installed.</FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-number" disabled={add.isPending}>
            {add.isPending ? <Spinner /> : null}
            Send code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
