"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUpdateMe } from "@/lib/api/queries";
import type { User } from "@/lib/api/types";
import { TimezoneSelect } from "./timezone-select";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileCard({ user }: { user: User }) {
  const update = useUpdateMe();
  const [name, setName] = useState(user.display_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [tz, setTz] = useState(user.timezone);
  const emailInvalid = email.trim() !== "" && !EMAIL.test(email.trim());
  const dirty = name !== (user.display_name ?? "") || email !== (user.email ?? "") || tz !== user.timezone;

  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
        <CardDescription>
          Signed in with <span className="font-medium text-foreground tabular">{user.phone_e164}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="display-name">Your name</FieldLabel>
          <Input id="display-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Field>
        <Field data-invalid={emailInvalid || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={emailInvalid || undefined} />
          {emailInvalid ? <FieldError>Enter a valid email address.</FieldError> : <FieldDescription>Only for account notices.</FieldDescription>}
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
          <TimezoneSelect id="timezone" value={tz} onChange={setTz} />
          <FieldDescription>So quiet hours, summaries and reminders happen at the right local time.</FieldDescription>
        </Field>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button
          disabled={!dirty || emailInvalid || update.isPending}
          onClick={() =>
            update.mutate(
              { display_name: name.trim() || null, email: email.trim() || null, timezone: tz },
              { onSuccess: () => toast.success("Saved") },
            )
          }
        >
          {update.isPending ? <Spinner /> : null}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
