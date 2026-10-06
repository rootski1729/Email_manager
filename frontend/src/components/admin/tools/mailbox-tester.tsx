"use client";

import { PlugZap } from "lucide-react";
import { useState } from "react";

import { CheckResults } from "@/components/admin/common/check-results";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { MAIL_HOST_PRESETS } from "@/lib/admin/presets";
import { useTestMailbox } from "@/lib/admin/queries";
import type { ImapCredentials } from "@/lib/admin/types";

type Creds = ImapCredentials & { smtp_host: string; smtp_username: string; smtp_password: string };

const BLANK: Creds = {
  host: "",
  port: 993,
  security: "ssl",
  username: "",
  password: "",
  folder: "INBOX",
  smtp_host: "",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "",
  smtp_password: "",
};

export function MailboxTester() {
  const test = useTestMailbox();
  const [address, setAddress] = useState("");
  const [preset, setPreset] = useState("");
  const [creds, setCreds] = useState<Creds>(BLANK);
  const [smtp, setSmtp] = useState(false);
  const note = MAIL_HOST_PRESETS.find((p) => p.id === preset)?.note;

  const set = <K extends keyof Creds>(k: K, v: Creds[K]) => setCreds((c) => ({ ...c, [k]: v }));
  const canRun = address.includes("@") && creds.host.trim() && creds.password && !test.isPending;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Try a mailbox login</CardTitle>
          <CardDescription>Checks that MailSentinel can sign in with these details. Nothing is saved.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canRun) return;
              const user = creds.username.trim() || address.trim();
              test.mutate({
                address: address.trim(),
                credentials: {
                  host: creds.host.trim(),
                  port: Number(creds.port) || 993,
                  security: creds.security,
                  username: user,
                  password: creds.password,
                  folder: creds.folder.trim() || "INBOX",
                  smtp_host: smtp ? creds.smtp_host.trim() || null : null,
                  smtp_port: Number(creds.smtp_port) || 465,
                  smtp_security: creds.smtp_security,
                  smtp_username: smtp ? creds.smtp_username.trim() || null : null,
                  smtp_password: smtp ? creds.smtp_password || null : null,
                },
              });
            }}
          >
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="mt-preset">Email provider</FieldLabel>
                <Select
                  value={preset}
                  onValueChange={(id) => {
                    setPreset(id);
                    const p = MAIL_HOST_PRESETS.find((x) => x.id === id);
                    if (p) {
                      setCreds((c) => ({
                        ...c,
                        host: p.host,
                        port: p.port,
                        security: p.security,
                        smtp_host: p.smtp_host,
                        smtp_port: p.smtp_port,
                        smtp_security: p.smtp_security,
                      }));
                    }
                  }}
                >
                  <SelectTrigger id="mt-preset" className="w-full">
                    <SelectValue placeholder="Choose to fill in the server details…" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAIL_HOST_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {note ? <FieldDescription>{note}</FieldDescription> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="mt-address">Email address</FieldLabel>
                <Input id="mt-address" type="email" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_6rem_7rem]">
                <Field>
                  <FieldLabel htmlFor="mt-host">IMAP server</FieldLabel>
                  <Input id="mt-host" spellCheck={false} value={creds.host} onChange={(e) => set("host", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mt-port">Port</FieldLabel>
                  <Input id="mt-port" type="number" inputMode="numeric" value={creds.port} onChange={(e) => set("port", Number(e.target.value))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mt-sec">Security</FieldLabel>
                  <Select value={creds.security} onValueChange={(v) => set("security", v as Creds["security"])}>
                    <SelectTrigger id="mt-sec" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="plain">None</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="mt-user">Username</FieldLabel>
                  <Input
                    id="mt-user"
                    autoComplete="off"
                    placeholder={address || "Usually the email address"}
                    value={creds.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mt-pass">Password or app password</FieldLabel>
                  <Input id="mt-pass" type="password" autoComplete="new-password" value={creds.password} onChange={(e) => set("password", e.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="mt-folder">Folder</FieldLabel>
                <Input id="mt-folder" value={creds.folder} onChange={(e) => set("folder", e.target.value)} />
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="mt-smtp">Also test sending (SMTP)</FieldLabel>
                  <FieldDescription>Needed for /email and /reply from WhatsApp.</FieldDescription>
                </FieldContent>
                <Switch id="mt-smtp" checked={smtp} onCheckedChange={setSmtp} />
              </Field>
              {smtp ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
                    <Field>
                      <FieldLabel htmlFor="mt-shost">SMTP server</FieldLabel>
                      <Input id="mt-shost" spellCheck={false} value={creds.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mt-sport">Port</FieldLabel>
                      <Input
                        id="mt-sport"
                        type="number"
                        inputMode="numeric"
                        value={creds.smtp_port}
                        onChange={(e) => set("smtp_port", Number(e.target.value))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mt-ssec">Security</FieldLabel>
                      <Select value={creds.smtp_security} onValueChange={(v) => set("smtp_security", v as Creds["smtp_security"])}>
                        <SelectTrigger id="mt-ssec" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ssl">SSL</SelectItem>
                          <SelectItem value="starttls">STARTTLS</SelectItem>
                          <SelectItem value="plain">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="mt-suser">SMTP username</FieldLabel>
                      <Input
                        id="mt-suser"
                        autoComplete="off"
                        placeholder="Same as IMAP"
                        value={creds.smtp_username}
                        onChange={(e) => set("smtp_username", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mt-spass">SMTP password</FieldLabel>
                      <Input
                        id="mt-spass"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Same as IMAP"
                        value={creds.smtp_password}
                        onChange={(e) => set("smtp_password", e.target.value)}
                      />
                    </Field>
                  </div>
                </>
              ) : null}
              <Button type="submit" disabled={!canRun}>
                {test.isPending ? <Spinner /> : <PlugZap />} Test login
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <div className="min-w-0">
        {test.data ? (
          <CheckResults results={test.data} />
        ) : (
          <EmptyState
            icon={PlugZap}
            title="Results appear here"
            description="Pick a provider, enter the address and password, then press Test login. It can take up to 30 seconds."
          />
        )}
      </div>
    </div>
  );
}
