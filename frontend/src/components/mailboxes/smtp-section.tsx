"use client";

import { ChevronDown, Send } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ImapPreset } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type SmtpSecurity = "ssl" | "starttls" | "plain";

export interface SmtpValue {
  enabled: boolean;
  host: string;
  port: string;
  security: SmtpSecurity;
  username: string;
  password: string;
}

const DEFAULT_PORT: Record<SmtpSecurity, number> = { ssl: 465, starttls: 587, plain: 25 };

export const EMPTY_SMTP: SmtpValue = { enabled: false, host: "", port: "465", security: "ssl", username: "", password: "" };

function asSecurity(v: string | null | undefined): SmtpSecurity {
  return v === "starttls" || v === "plain" ? v : "ssl";
}

/** Prefill SMTP server details from an IMAP preset; keeps the user's on/off choice and login. */
export function smtpFromPreset(current: SmtpValue, preset: ImapPreset | undefined): SmtpValue {
  if (!preset?.smtp_host) return { ...current, host: "", port: "465", security: "ssl" };
  const security = asSecurity(preset.smtp_security);
  return {
    ...current,
    host: preset.smtp_host,
    port: String(preset.smtp_port ?? DEFAULT_PORT[security]),
    security,
  };
}

/** Returns an error message, or null when the SMTP section is valid (or switched off). */
export function validateSmtp(v: SmtpValue): string | null {
  if (!v.enabled) return null;
  if (!v.host.trim()) return "Enter the outgoing mail server, or switch sending off.";
  const port = Number(v.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "The sending port must be 1–65535.";
  return null;
}

/** Fields to merge into ImapCredentials. With sending off, SMTP is left unset (the mailbox can't send). */
export function smtpCredentials(v: SmtpValue) {
  const security = v.security;
  if (!v.enabled || !v.host.trim()) {
    return { smtp_host: null, smtp_port: 465, smtp_security: "ssl" as SmtpSecurity };
  }
  return {
    smtp_host: v.host.trim(),
    smtp_port: Number(v.port) || DEFAULT_PORT[security],
    smtp_security: security,
    smtp_username: v.username.trim() || null,
    smtp_password: v.password || null,
  };
}

export function SmtpSection({
  value,
  onChange,
  error,
  idPrefix,
  note,
  defaultOpen = false,
}: {
  value: SmtpValue;
  onChange: (v: SmtpValue) => void;
  error?: string | null;
  idPrefix: string;
  note?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || value.enabled);
  const set = (patch: Partial<SmtpValue>) => onChange({ ...value, ...patch });

  return (
    <Collapsible open={open || Boolean(error)} onOpenChange={setOpen} className="rounded-lg border">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <Send className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-medium">Also send email from this address (optional)</span>
            <span className="block truncate text-xs text-muted-foreground">
              {value.enabled && value.host
                ? `${value.host}:${value.port} · ${value.security === "starttls" ? "STARTTLS" : value.security === "ssl" ? "SSL/TLS" : "plain"}`
                : "Write emails on WhatsApp and send them from here"}
            </span>
          </span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => {
            set({ enabled });
            if (enabled) setOpen(true);
          }}
          aria-label="Allow sending through this mailbox"
        />
      </div>
      <CollapsibleContent>
        <div className={cn("space-y-4 border-t p-3", !value.enabled && "opacity-60")}>
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
          <div className="grid gap-4 sm:grid-cols-[1fr_6.5rem]">
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-smtp-host`}>Outgoing mail server (SMTP)</FieldLabel>
              <Input
                id={`${idPrefix}-smtp-host`}
                placeholder="smtp.example.com"
                className="font-mono"
                value={value.host}
                disabled={!value.enabled}
                onChange={(e) => set({ host: e.target.value })}
                aria-invalid={Boolean(error) || undefined}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-smtp-port`}>Port</FieldLabel>
              <Input
                id={`${idPrefix}-smtp-port`}
                inputMode="numeric"
                className="tabular"
                value={value.port}
                disabled={!value.enabled}
                onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Security</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={value.security}
              disabled={!value.enabled}
              onValueChange={(v) => {
                if (!v) return;
                const security = v as SmtpSecurity;
                set({ security, port: String(DEFAULT_PORT[security]) });
              }}
              aria-label="SMTP connection security"
            >
              <ToggleGroupItem value="ssl">SSL/TLS</ToggleGroupItem>
              <ToggleGroupItem value="starttls">STARTTLS</ToggleGroupItem>
              <ToggleGroupItem value="plain">Plain</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-smtp-user`}>Username for sending</FieldLabel>
              <Input
                id={`${idPrefix}-smtp-user`}
                autoComplete="off"
                placeholder="Same as above"
                value={value.username}
                disabled={!value.enabled}
                onChange={(e) => set({ username: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-smtp-pass`}>Password for sending</FieldLabel>
              <Input
                id={`${idPrefix}-smtp-pass`}
                type="password"
                autoComplete="new-password"
                placeholder="Same as above"
                value={value.password}
                disabled={!value.enabled}
                onChange={(e) => set({ password: e.target.value })}
              />
            </Field>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <FieldDescription>We test this when you save. Your app password usually works for both.</FieldDescription>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
