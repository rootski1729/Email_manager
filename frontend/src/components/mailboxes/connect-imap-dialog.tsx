"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, KeyRound, Send } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useConnectImap } from "@/lib/api/queries";
import type { ImapPreset, Mailbox } from "@/lib/api/types";
import { EMPTY_SMTP, SmtpSection, smtpCredentials, smtpFromPreset, validateSmtp, type SmtpValue } from "./smtp-section";

/** How to get an app password, in plain steps. */
const PRESET_INFO: Record<string, { label: string; help: string }> = {
  outlook: {
    label: "Outlook / Microsoft 365",
    help: "Sign in at account.microsoft.com → Security → Advanced security options → App passwords → Create. (Two-step verification must be on.)",
  },
  yahoo: {
    label: "Yahoo Mail",
    help: "Open Yahoo Account Security → “Generate app password”, name it MailSentinel, and copy the password it shows.",
  },
  zoho: {
    label: "Zoho Mail",
    help: "In Zoho Mail settings turn on IMAP access, then create an application-specific password in your Zoho account security.",
  },
  icloud: {
    label: "iCloud Mail",
    help: "Sign in at account.apple.com → Sign-In and Security → App-Specific Passwords → generate one.",
  },
  "gmail-imap": {
    label: "Gmail (with an app password)",
    help: "Prefer the normal Gmail option — it's instant. Otherwise create an app password at myaccount.google.com/apppasswords.",
  },
};

export const CUSTOM = "custom";

export const PRESET_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PRESET_INFO).map(([id, info]) => [id, info.label]),
);

const schema = z.object({
  preset: z.string(),
  address: z.email("Enter the mailbox's email address."),
  display_name: z.string().max(120).optional(),
  host: z.string().trim().min(1, "Enter the incoming mail (IMAP) server.").max(255),
  port: z.coerce.number<string | number>().int().min(1, "Port must be 1–65535.").max(65535, "Port must be 1–65535."),
  security: z.enum(["ssl", "plain"]),
  username: z.string().max(320).optional(),
  password: z.string().min(1, "Paste the app password.").max(1024),
  folder: z.string().trim().max(255).optional(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const DEFAULTS: FormInput = {
  preset: CUSTOM,
  address: "",
  display_name: "",
  host: "",
  port: 993,
  security: "ssl",
  username: "",
  password: "",
  folder: "INBOX",
};

/**
 * Connect a mailbox with an app password. For a known provider only the email address and
 * app password are asked; server details appear only for "Other" (or under "Server settings").
 */
export function ImapConnectForm({
  presets,
  initialPreset,
  allowPresetChoice = false,
  onDone,
  onBack,
}: {
  presets: ImapPreset[];
  initialPreset: string;
  /** Show the provider picker (for "Other"). */
  allowPresetChoice?: boolean;
  onDone: (mailbox: Mailbox) => void;
  onBack: () => void;
}) {
  const connect = useConnectImap();
  const start = presets.find((x) => x.id === initialPreset);
  const [smtp, setSmtp] = useState<SmtpValue>(() => smtpFromPreset(EMPTY_SMTP, start));
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: start
      ? { ...DEFAULTS, preset: start.id, host: start.host, port: start.port, security: start.security === "plain" ? "plain" : "ssl" }
      : { ...DEFAULTS, preset: CUSTOM },
  });
  const [preset, security] = useWatch({ control: form.control, name: ["preset", "security"] });
  const presetData = presets.find((x) => x.id === preset);

  function applyPreset(id: string) {
    form.setValue("preset", id);
    const p = presets.find((x) => x.id === id);
    if (p) {
      form.setValue("host", p.host, { shouldValidate: form.formState.isSubmitted });
      form.setValue("port", p.port);
      form.setValue("security", p.security === "plain" ? "plain" : "ssl");
    }
    setSmtp((cur) => smtpFromPreset(cur, p));
  }

  async function onSubmit(values: FormValues) {
    const smtpProblem = validateSmtp(smtp);
    setSmtpError(smtpProblem);
    if (smtpProblem) return;
    try {
      const mailbox = await connect.mutateAsync({
        address: values.address.trim(),
        display_name: values.display_name?.trim() || null,
        preset: values.preset === CUSTOM ? null : values.preset,
        credentials: {
          host: values.host.trim(),
          port: values.port,
          security: values.security,
          username: values.username?.trim() || values.address.trim(),
          password: values.password,
          folder: values.folder?.trim() || "INBOX",
          ...smtpCredentials(smtp),
        },
      });
      toast.success(`${mailbox.address} is connected`, {
        description: mailbox.can_send
          ? "We'll check it every minute, and you can send email from it on WhatsApp."
          : "We'll check it for new email every minute.",
      });
      onDone(mailbox);
    } catch (err) {
      if (err instanceof ApiError && err.code === "smtp_failed") {
        setSmtpError(`${err.detail} Check the sending details, or switch sending off to just watch this mailbox.`);
        return;
      }
      if (err instanceof ApiError && err.status === 422 && err.errors.length) {
        for (const fe of err.fieldErrors()) {
          const key = fe.path.split(".").pop() as keyof FormInput;
          if (key in DEFAULTS) form.setError(key, { message: fe.message });
        }
      }
      form.setError("root", { message: errorMessage(err) });
    }
  }

  const info = PRESET_INFO[preset];
  const errors = form.formState.errors;
  const custom = preset === CUSTOM;
  const serverFields = (
    <div className="grid gap-4 sm:grid-cols-[1fr_6.5rem]">
      <Field data-invalid={Boolean(errors.host) || undefined}>
        <FieldLabel htmlFor="imap-host">Incoming mail server (IMAP)</FieldLabel>
        <Input id="imap-host" placeholder="imap.example.com" className="font-mono" {...form.register("host")} aria-invalid={Boolean(errors.host) || undefined} />
        <FieldError errors={[errors.host]} />
      </Field>
      <Field data-invalid={Boolean(errors.port) || undefined}>
        <FieldLabel htmlFor="imap-port">Port</FieldLabel>
        <Input id="imap-port" inputMode="numeric" className="tabular" {...form.register("port")} aria-invalid={Boolean(errors.port) || undefined} />
        <FieldError errors={[errors.port]} />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Security</FieldLabel>
        <Controller
          control={form.control}
          name="security"
          render={({ field }) => (
            <ToggleGroup
              type="single"
              variant="outline"
              value={field.value}
              onValueChange={(v) => {
                if (!v) return;
                field.onChange(v);
                form.setValue("port", v === "ssl" ? 993 : 143);
              }}
              aria-label="Connection security"
            >
              <ToggleGroupItem value="ssl">Encrypted (993)</ToggleGroupItem>
              <ToggleGroupItem value="plain">Not encrypted (143)</ToggleGroupItem>
            </ToggleGroup>
          )}
        />
        {security === "plain" ? (
          <FieldDescription className="text-warning">
            Without encryption your password travels in plain text. Only use this on a network you trust.
          </FieldDescription>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="imap-username">Username</FieldLabel>
        <Input id="imap-username" autoComplete="username" placeholder="Usually your email address" {...form.register("username")} />
      </Field>
      <Field>
        <FieldLabel htmlFor="imap-folder">Folder</FieldLabel>
        <Input id="imap-folder" className="font-mono" {...form.register("folder")} />
      </Field>
    </div>
  );

  return (
    <>
      <form id="imap-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="gap-4">
          {allowPresetChoice ? (
            <Field>
              <FieldLabel htmlFor="imap-preset">Your email provider</FieldLabel>
              <Select value={preset} onValueChange={applyPreset}>
                <SelectTrigger id="imap-preset" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {PRESET_INFO[p.id]?.label ?? p.id}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Something else (I know my server details)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field data-invalid={Boolean(errors.address) || undefined}>
            <FieldLabel htmlFor="imap-address">Email address</FieldLabel>
            <Input id="imap-address" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("address")} aria-invalid={Boolean(errors.address) || undefined} />
            <FieldError errors={[errors.address]} />
          </Field>

          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="imap-password">App password</FieldLabel>
            <Input id="imap-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={Boolean(errors.password) || undefined} />
            <FieldError errors={[errors.password]} />
          </Field>

          <Alert className="border-brand/40 bg-brand/10">
            <KeyRound />
            <AlertDescription>
              <p>
                <strong className="text-foreground">What&apos;s an app password?</strong> Most providers don&apos;t let
                apps use your normal password. An app password is a separate one, just for MailSentinel. You can cancel it
                anytime, and we store it encrypted.
              </p>
              {info ? <p className="mt-1.5">{info.help}</p> : null}
            </AlertDescription>
          </Alert>

          {custom ? (
            <>
              {serverFields}
              <SmtpSection
                idPrefix="imap"
                value={smtp}
                onChange={(v) => {
                  setSmtp(v);
                  if (smtpError) setSmtpError(null);
                }}
                error={smtpError}
              />
            </>
          ) : (
            <>
              {presetData?.smtp_host ? (
                <Field orientation="horizontal" className="rounded-xl border p-3">
                  <FieldContent>
                    <FieldLabel htmlFor="imap-send" className="flex items-center gap-2">
                      <Send className="size-4 text-muted-foreground" aria-hidden /> Also send email from this address
                    </FieldLabel>
                    <FieldDescription>Write emails on WhatsApp and send them from here. Nothing goes out until you reply YES.</FieldDescription>
                    {smtpError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {smtpError}
                      </p>
                    ) : null}
                  </FieldContent>
                  <Switch
                    id="imap-send"
                    checked={smtp.enabled}
                    onCheckedChange={(enabled) => {
                      setSmtp((cur) => ({ ...cur, enabled }));
                      setSmtpError(null);
                    }}
                  />
                </Field>
              ) : null}
              <details className="text-sm">
                <summary className="cursor-pointer rounded-md text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring">
                  Server settings (you rarely need these)
                </summary>
                <div className="mt-3">{serverFields}</div>
              </details>
            </>
          )}

          <Field>
            <FieldLabel htmlFor="imap-name">Nickname (optional)</FieldLabel>
            <Input id="imap-name" placeholder="Work inbox" {...form.register("display_name")} />
          </Field>

          {errors.root ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onBack} type="button">
          Back
        </Button>
        <Button type="submit" form="imap-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Spinner /> : null}
          {form.formState.isSubmitting ? "Checking…" : "Connect"}
        </Button>
      </DialogFooter>
    </>
  );
}
