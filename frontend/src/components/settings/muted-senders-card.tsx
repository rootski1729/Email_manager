"use client";

import { AlertTriangle, BellOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TagInput } from "@/components/rules/tag-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useUpdateSettings } from "@/lib/api/queries";
import type { Settings } from "@/lib/api/types";

const MAX_MUTED = 200;

/** Same normalisation as the backend's SettingsUpdate validator. */
function normalize(raw: string) {
  return raw.trim().toLowerCase().replace(/^<|>$/g, "").replace(/^@/, "");
}

function isInvalid(v: string) {
  const host = v.split("@").pop() ?? "";
  return !host.includes(".") || /\s/.test(v) || v.length > 320 || (v.includes("@") && !/^[^@]+@[^@]+$/.test(v));
}

/** Addresses or domains that never trigger WhatsApp alerts. Mount with a `key` so it resets after a save. */
export function MutedSendersCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings({ silent: true });
  const [values, setValues] = useState(settings.muted_senders);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(settings.muted_senders);
  const invalid = values.some(isInvalid);
  const ref = useRef<HTMLDivElement>(null);

  // Links like /settings#muted-senders arrive before settings have loaded; scroll once the card exists.
  useEffect(() => {
    if (window.location.hash === "#muted-senders") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Card ref={ref} id="muted-senders" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellOff className="size-4 text-muted-foreground" /> Muted senders
        </CardTitle>
        <CardDescription>
          No WhatsApp alerts from these senders. Their emails still show up in Important mail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="muted-input">Addresses and domains</FieldLabel>
          <TagInput
            id="muted-input"
            values={values}
            onChange={(v) => {
              setValues(v);
              setError(null);
            }}
            normalize={normalize}
            isValueInvalid={isInvalid}
            invalid={invalid}
            max={MAX_MUTED}
            mono
            ariaLabel="Add an address or domain to mute"
            placeholder="news@shop.com or shop.com"
          />
          <FieldDescription>
            {invalid
              ? "Remove the highlighted entries: use a full address (name@domain.com) or a domain (domain.com)."
              : "A domain also mutes its subdomains: shop.com covers mail.shop.com. Press Enter to add. Tip: /mute K7 on WhatsApp does this too."}
          </FieldDescription>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t">
        {dirty ? (
          <Button variant="ghost" onClick={() => setValues(settings.muted_senders)} disabled={update.isPending}>
            Reset
          </Button>
        ) : null}
        <Button
          disabled={!dirty || invalid || update.isPending}
          onClick={() => {
            setError(null);
            update.mutate(
              { muted_senders: values },
              {
                onSuccess: (s) => {
                  setValues(s.muted_senders);
                  toast.success("Muted senders saved");
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          {update.isPending ? <Spinner /> : null}
          Save muted senders
        </Button>
      </CardFooter>
    </Card>
  );
}
