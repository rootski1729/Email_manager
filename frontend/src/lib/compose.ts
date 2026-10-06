/**
 * Client-side mirror of the backend's WhatsApp compose rendering
 * (backend app/compose/commands.py: INSTRUCTIONS, render_form, fill_placeholders)
 * so the template editor can preview unsaved changes. Saved templates use
 * GET /email-templates/{id}/preview, which is authoritative.
 */
import type { Mailbox } from "@/lib/api/types";

export const TEMPLATE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const TEMPLATE_NAME_MAX = 40;
export const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export const PLACEHOLDERS = ["date", "time", "name"] as const;

export const INSTRUCTIONS =
  "✉️ *Send an email from WhatsApp*\n\n" +
  "1. Copy the next message (long-press → Copy).\n" +
  "2. Fill in *To*, *Subject* and the text after *Body:*. Separate several addresses with commas.\n" +
  "3. Want attachments? Send the photos or documents here first.\n" +
  "4. Paste and send the form. I'll show a preview; reply *YES* to send or *NO* to cancel.\n\n" +
  "_From_ must be one of your connected mailboxes that can send.";

export const COMMANDS: { command: string; description: string }[] = [
  { command: "/email", description: "Get a blank form, or your default template" },
  { command: "/email <name>", description: "Get a saved template, e.g. /email leave" },
  { command: "/templates", description: "List your templates" },
  { command: "/send …", description: "Send the filled-in form (you confirm first)" },
  { command: "YES / NO", description: "Confirm or cancel the email waiting for confirmation" },
  { command: "/cancel", description: "Cancel and drop any attachments you sent" },
  { command: "/help", description: "Show all commands" },
];

/** Turn free text into a valid template name: lower-case, dashes for spaces, allowed characters only. */
export function slugifyTemplateName(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[-_]+/, "")
    .slice(0, TEMPLATE_NAME_MAX);
}

function parts(now: Date, timeZone: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  } catch {
    return parts(now, "UTC");
  }
}

/** Same substitutions as the backend: {{date}} → "05 Oct 2026", {{time}} → "14:30", {{name}} → display name. */
export function fillPlaceholders(text: string, opts: { now: Date; timeZone: string; name: string | null | undefined }) {
  const p = parts(opts.now, opts.timeZone);
  const values: Record<string, string> = {
    date: `${p.day} ${p.month} ${p.year}`,
    time: `${p.hour}:${p.minute}`,
    name: opts.name ?? "",
  };
  return text.replace(/\{\{\s*(date|time|name)\s*\}\}/gi, (_m, key: string) => values[key.toLowerCase()] ?? "");
}

export interface FormValues {
  fromAddress: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
}

export function renderForm(v: FormValues): string {
  return [
    "/send",
    `From: ${v.fromAddress}`,
    `To: ${v.to.join(", ")}`,
    `Cc: ${v.cc.join(", ")}`,
    `Bcc: ${v.bcc.join(", ")}`,
    `Subject: ${v.subject}`,
    "Body:",
    v.body || "Write your message here.",
  ].join("\n");
}

const SENDABLE_STATUS = new Set(["active", "paused", "error"]);

/** Mailboxes the bot may send from, in the backend's order (oldest first). */
export function sendingMailboxes(mailboxes: Mailbox[]): Mailbox[] {
  return mailboxes
    .filter((m) => m.can_send && SENDABLE_STATUS.has(m.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function pickMailbox(mailboxes: Mailbox[], preferred: string | null | undefined): Mailbox | undefined {
  const usable = sendingMailboxes(mailboxes);
  return usable.find((m) => m.id === preferred) ?? usable[0];
}

export function humanSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
