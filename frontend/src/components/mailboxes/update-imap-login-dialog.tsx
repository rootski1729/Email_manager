"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { imapPresetsQuery, mailboxConnectionQuery, useUpdateImapCredentials } from "@/lib/api/queries";
import type { ImapConnection, Mailbox } from "@/lib/api/types";
import { PRESET_LABELS } from "./connect-imap-dialog";
import {
  EMPTY_SMTP,
  SmtpSection,
  smtpCredentials,
  smtpFromPreset,
  validateSmtp,
  type SmtpSecurity,
  type SmtpValue,
} from "./smtp-section";

const schema = z.object({
  host: z.string().trim().min(1, "Enter the incoming mail server.").max(255),
  port: z.coerce.number<string | number>().int().min(1, "Port must be 1–65535.").max(65535, "Port must be 1–65535."),
  security: z.enum(["ssl", "plain"]),
  username: z.string().trim().min(1, "Enter the username.").max(320),
  // Blank keeps the saved password (the API merges it).
  password: z.string().max(1024),
  folder: z.string().trim().max(255).optional(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

function smtpFromSaved(saved: ImapConnection | undefined): SmtpValue {
  if (!saved?.smtp_host) return EMPTY_SMTP;
  const security: SmtpSecurity =
    saved.smtp_security === "starttls" || saved.smtp_security === "plain" ? saved.smtp_security : "ssl";
  return {
    enabled: true,
    host: saved.smtp_host,
    port: String(saved.smtp_port),
    security,
    username: saved.smtp_username ?? "",
    password: "",
  };
}

/** Change the login or servers of an IMAP mailbox without losing its history or rules. */
export function UpdateImapLoginDialog({
  mailbox,
  open,
  onOpenChange,
}: {
  mailbox: Mailbox;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const connection = useQuery({ ...mailboxConnectionQuery(mailbox.id), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update login</DialogTitle>
          <DialogDescription>
            Change the server details or app password for {mailbox.address}. Leave a password blank to keep the saved
            one. Your rules and matched emails are kept.
          </DialogDescription>
        </DialogHeader>
        {connection.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          // Remount with fresh values whenever the saved settings change.
          <UpdateImapLoginForm
            key={connection.dataUpdatedAt}
            mailbox={mailbox}
            saved={connection.data}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UpdateImapLoginForm({
  mailbox,
  saved,
  onDone,
}: {
  mailbox: Mailbox;
  saved: ImapConnection | undefined;
  onDone: () => void;
}) {
  const update = useUpdateImapCredentials();
  const presets = useQuery(imapPresetsQuery);
  const [serverError, setServerError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState("custom");
  const [smtp, setSmtp] = useState<SmtpValue>(() => smtpFromSaved(saved));
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      host: saved?.host ?? "",
      port: saved?.port ?? 993,
      security: saved?.security === "plain" ? "plain" : "ssl",
      username: saved?.username ?? mailbox.address,
      password: "",
      folder: saved?.folder ?? "INBOX",
    },
  });

  function applyPreset(id: string) {
    setPresetId(id);
    const p = presets.data?.find((x) => x.id === id);
    if (p) {
      form.setValue("host", p.host, { shouldValidate: form.formState.isSubmitted });
      form.setValue("port", p.port);
      form.setValue("security", p.security === "plain" ? "plain" : "ssl");
    }
    setSmtp((cur) => smtpFromPreset(cur, p));
  }

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    const smtpProblem = validateSmtp(smtp);
    setSmtpError(smtpProblem);
    if (smtpProblem) return;
    try {
      await update.mutateAsync({
        id: mailbox.id,
        credentials: {
          ...values,
          password: values.password || null,
          folder: values.folder || "INBOX",
          ...smtpCredentials(smtp),
        },
      });
      toast.success("Login updated", { description: `${mailbox.address} is being monitored again.` });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "smtp_failed") {
        setSmtpError(`${err.detail} Check the SMTP details, or turn sending off.`);
        return;
      }
      setServerError(errorMessage(err));
    }
  });

  return (
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="imap-update-preset">Provider</FieldLabel>
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger id="imap-update-preset" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(presets.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {PRESET_LABELS[p.id] ?? p.id}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Other (enter server details)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field data-invalid={!!form.formState.errors.host}>
                <FieldLabel htmlFor="imap-host">Incoming mail server (IMAP)</FieldLabel>
                <Input id="imap-host" placeholder="imap.example.com" autoComplete="off" {...form.register("host")} />
                <FieldError errors={[form.formState.errors.host]} />
              </Field>
              <Field data-invalid={!!form.formState.errors.port}>
                <FieldLabel htmlFor="imap-port">Port</FieldLabel>
                <Input id="imap-port" inputMode="numeric" {...form.register("port")} />
                <FieldError errors={[form.formState.errors.port]} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Security</FieldLabel>
              <Controller
                control={form.control}
                name="security"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    <ToggleGroupItem value="ssl">SSL/TLS</ToggleGroupItem>
                    <ToggleGroupItem value="plain">None</ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </Field>
            <Field data-invalid={!!form.formState.errors.username}>
              <FieldLabel htmlFor="imap-user">Username</FieldLabel>
              <Input id="imap-user" autoComplete="username" {...form.register("username")} />
              <FieldError errors={[form.formState.errors.username]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="imap-pass">App password</FieldLabel>
              <Input
                id="imap-pass"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep the saved password"
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <SmtpSection
              idPrefix="imap-update"
              value={smtp}
              onChange={(v) => {
                setSmtp(v);
                if (smtpError) setSmtpError(null);
              }}
              error={smtpError}
              defaultOpen={mailbox.can_send}
              note={
                saved?.has_smtp_password
                  ? "Your sending password is saved. Leave it blank to keep it. Switch sending off to stop /email from using this mailbox."
                  : mailbox.can_send
                    ? "Turning sending off stops /email from using this mailbox."
                    : undefined
              }
            />
            {serverError ? (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : <KeyRound />} Save and reconnect
            </Button>
          </DialogFooter>
        </form>
  );
}
