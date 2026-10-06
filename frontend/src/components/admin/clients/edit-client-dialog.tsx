"use client";

import { useMemo, useState } from "react";
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
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/errors";
import { planLabel } from "@/lib/admin/labels";
import { useUpdateClient } from "@/lib/admin/queries";
import { PLANS, type ClientRow, type ClientUpdate } from "@/lib/admin/types";

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

function EditForm({ client, onDone }: { client: ClientRow; onDone: () => void }) {
  const update = useUpdateClient(client.id);
  const zones = useMemo(() => timeZones(), []);
  const [name, setName] = useState(client.display_name ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [timezone, setTimezone] = useState(client.timezone);
  const [plan, setPlan] = useState(client.plan);
  const [active, setActive] = useState(client.is_active);
  const [error, setError] = useState<string | null>(null);

  const changes: ClientUpdate = {};
  if (name.trim() !== (client.display_name ?? "")) changes.display_name = name.trim() || null;
  if (email.trim() !== (client.email ?? "")) changes.email = email.trim() || null;
  if (timezone.trim() !== client.timezone) changes.timezone = timezone.trim();
  if (plan !== client.plan) changes.plan = plan;
  if (active !== client.is_active) changes.is_active = active;
  const dirty = Object.keys(changes).length > 0;

  return (
    <>
      <form
        id="edit-client"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          setError(null);
          update.mutate(changes, {
            onSuccess: () => {
              toast.success("Client updated");
              onDone();
            },
            onError: (err) => setError(errorMessage(err)),
          });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-name">Name</FieldLabel>
            <Input id="edit-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-email">Email (for receipts and contact)</FieldLabel>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-tz">Time zone</FieldLabel>
              <Input
                id="edit-tz"
                list="admin-time-zones"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
              <datalist id="admin-time-zones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-plan">Plan</FieldLabel>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger id="edit-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...PLANS, client.plan])].map((p) => (
                    <SelectItem key={p} value={p}>
                      {planLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="edit-active">Account active</FieldLabel>
              <FieldDescription>Turning this off signs them out and stops their alerts.</FieldDescription>
            </FieldContent>
            <Switch id="edit-active" checked={active} onCheckedChange={setActive} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="edit-client" disabled={!dirty || update.isPending}>
          {update.isPending ? <Spinner /> : null} Save changes
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: ClientRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Only the fields you change are saved.</DialogDescription>
        </DialogHeader>
        {/* Remount on open so the form starts from the latest values. */}
        {open ? <EditForm client={client} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
