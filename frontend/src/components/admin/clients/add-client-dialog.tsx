"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { planLabel } from "@/lib/admin/labels";
import { useCreateClient } from "@/lib/admin/queries";
import { PLANS } from "@/lib/admin/types";

export function AddClientDialog() {
  const router = useRouter();
  const create = useCreateClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<string>("free");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhone("");
    setName("");
    setPlan("free");
    setError(null);
  };

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
          <UserPlus /> Add client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            They can sign in right away with this WhatsApp number. Alerts go to the same number.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-client"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate(
              { phone: phone.trim(), display_name: name.trim() || null, plan },
              {
                onSuccess: (row) => {
                  toast.success("Client added");
                  setOpen(false);
                  reset();
                  router.push(`/admin/clients/${row.id}`);
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-phone">WhatsApp number</FieldLabel>
              <Input
                id="client-phone"
                type="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <FieldDescription>Include the country code.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="client-name">Name (optional)</FieldLabel>
              <Input id="client-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-plan">Plan</FieldLabel>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger id="client-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {planLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="add-client" disabled={phone.trim().length < 6 || create.isPending}>
            {create.isPending ? <Spinner /> : null} Add client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
