"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Info, KeyRound, Server } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { imapPresetsQuery, useConnectImap } from "@/lib/api/queries";
import type { ImapPreset } from "@/lib/api/types";
import { EMPTY_SMTP, SmtpSection, smtpCredentials, smtpFromPreset, validateSmtp, type SmtpValue } from "./smtp-section";

const PRESET_INFO: Record<string, { label: string; help: string }> = {
  outlook: {
    label: "Outlook / Microsoft 365",
    help: "Turn on two-step verification, then create an app password in your Microsoft account security settings.",
  },
  yahoo: {
    label: "Yahoo Mail",
    help: "In Yahoo Account Security, choose “Generate app password” and paste it here.",
  },
  zoho: {
    label: "Zoho Mail",
    help: "Enable IMAP access in Zoho Mail settings, then create an application-specific password.",
  },
  icloud: {
    label: "iCloud Mail",
    help: "Sign in to your Apple Account, open Sign-In and Security → App-Specific Passwords, and generate one.",
  },
  "gmail-imap": {
    label: "Gmail (IMAP)",
    help: "Prefer “Connect Gmail” for instant push. For IMAP, create an app password at myaccount.google.com/apppasswords.",
  },
};

const CUSTOM = "custom";

export const PRESET_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PRESET_INFO).map(([id, info]) => [id, info.label]),
);

const schema = z.object({
  preset: z.string(),
  address: z.email("Enter the mailbox's email address."),
  display_name: z.string().max(120).optional(),
  host: z.string().trim().min(1, "Enter the IMAP server host.").max(255),
  port: z.coerce.number<string | number>().int().min(1, "Port must be 1–65535.").max(65535, "Port must be 1–65535."),
  security: z.enum(["ssl", "plain"]),
  username: z.string().max(320).optional(),
  password: z.string().min(1, "Enter the app password.").max(1024),
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

export function ConnectImapDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const presets = useQuery({ ...imapPresetsQuery, enabled: open });
  const connect = useConnectImap();
  const [smtp, setSmtp] = useState<SmtpValue>(EMPTY_SMTP);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const [preset, host, port, security] = useWatch({
    control: form.control,
    name: ["preset", "host", "port", "security"],
  });

  function applyPreset(id: string) {
    form.setValue("preset", id);
    const p = presets.data?.find((x: ImapPreset) => x.id === id);
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
      toast.success(`Connected ${mailbox.address}`, {
        description: mailbox.can_send
          ? "We'll check it every minute, and you can send email from WhatsApp with /email."
          : "We'll check it for new mail every minute.",
      });
      setOpen(false);
      form.reset(DEFAULTS);
      setSmtp(EMPTY_SMTP);
      setSmtpError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "smtp_failed") {
        setSmtpError(`${err.detail} Check the SMTP details, or turn sending off to connect for monitoring only.`);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          form.reset(DEFAULTS);
          setSmtp(EMPTY_SMTP);
          setSmtpError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-4 text-primary" /> Connect an IMAP mailbox
          </DialogTitle>
          <DialogDescription>Works with Outlook, Yahoo, Zoho, iCloud and any provider that supports IMAP.</DialogDescription>
        </DialogHeader>
        <form id="imap-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="imap-preset">Provider</FieldLabel>
              <Select value={preset} onValueChange={applyPreset}>
                <SelectTrigger id="imap-preset" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(presets.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {PRESET_INFO[p.id]?.label ?? p.id}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Other (custom server)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={Boolean(errors.address) || undefined}>
              <FieldLabel htmlFor="imap-address">Email address</FieldLabel>
              <Input id="imap-address" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("address")} aria-invalid={Boolean(errors.address) || undefined} />
              <FieldError errors={[errors.address]} />
            </Field>

            {preset === CUSTOM ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_6.5rem]">
                <Field data-invalid={Boolean(errors.host) || undefined}>
                  <FieldLabel htmlFor="imap-host">IMAP server</FieldLabel>
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
                        <ToggleGroupItem value="ssl">SSL/TLS (993)</ToggleGroupItem>
                        <ToggleGroupItem value="plain">Plain (143)</ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  />
                  {security === "plain" ? (
                    <FieldDescription className="text-amber-700 dark:text-amber-300">
                      Plain connections send your password unencrypted. Use only on trusted networks.
                    </FieldDescription>
                  ) : null}
                </Field>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Server: <span className="font-mono">{host || "—"}</span> · port {String(port)} ·{" "}
                {security === "ssl" ? "SSL/TLS" : "plain"}
              </p>
            )}

            <Field>
              <FieldLabel htmlFor="imap-username">Username</FieldLabel>
              <Input id="imap-username" autoComplete="username" placeholder="Defaults to the email address" {...form.register("username")} />
            </Field>

            <Field data-invalid={Boolean(errors.password) || undefined}>
              <FieldLabel htmlFor="imap-password">App password</FieldLabel>
              <Input id="imap-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={Boolean(errors.password) || undefined} />
              <FieldError errors={[errors.password]} />
            </Field>

            <SmtpSection
              idPrefix="imap"
              value={smtp}
              onChange={(v) => {
                setSmtp(v);
                if (smtpError) setSmtpError(null);
              }}
              error={smtpError}
            />

            <Alert>
              <KeyRound />
              <AlertDescription>
                <p>
                  Most providers block your normal password for IMAP. Create an <strong>app password</strong> — a
                  separate password just for MailSentinel that you can revoke anytime. It&apos;s stored encrypted.
                </p>
                {info ? <p className="mt-1">{info.help}</p> : null}
              </AlertDescription>
            </Alert>

            <details className="group text-sm">
              <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">Advanced</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="imap-folder">Folder</FieldLabel>
                  <Input id="imap-folder" className="font-mono" {...form.register("folder")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="imap-name">Display name</FieldLabel>
                  <Input id="imap-name" placeholder="Work inbox" {...form.register("display_name")} />
                </Field>
              </div>
            </details>

            {errors.root ? (
              <Alert variant="destructive">
                <Info />
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} type="button">
            Cancel
          </Button>
          <Button type="submit" form="imap-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner /> : null}
            {form.formState.isSubmitting ? "Checking login…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
