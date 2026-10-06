/** Plain-language labels used across the admin console. */

import type { AuditRow, MailboxStatus, NotificationStatus } from "./types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

/** Where to go to fix a failing health item. */
export const HEALTH_FIX: Record<string, { href: string; label: string }> = {
  whatsapp: { href: "/admin/whatsapp", label: "Fix WhatsApp" },
  dispatcher: { href: "/admin/whatsapp", label: "Open WhatsApp" },
  google: { href: "/admin/google", label: "Set up Gmail" },
  listener: { href: "/admin/google", label: "Open Gmail setup" },
};

export const MAILBOX_STATUS: Record<MailboxStatus, { label: string; tone: Tone; hint: string }> = {
  active: { label: "Working", tone: "success", hint: "Mail is being checked." },
  paused: { label: "Paused", tone: "neutral", hint: "Checking is paused." },
  reauth_required: { label: "Needs sign-in", tone: "warning", hint: "The client must reconnect this mailbox." },
  error: { label: "Error", tone: "danger", hint: "The last check failed." },
};

export const NOTIFICATION_STATUS: Record<NotificationStatus, { label: string; tone: Tone }> = {
  queued: { label: "Waiting", tone: "neutral" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "brand" },
  delivered: { label: "Delivered", tone: "success" },
  read: { label: "Read", tone: "success" },
  held: { label: "Held (quiet hours)", tone: "warning" },
  folded: { label: "In a digest", tone: "neutral" },
  failed: { label: "Failed, retrying", tone: "danger" },
  dead: { label: "Gave up", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function wahaWords(status: string | null | undefined): { label: string; tone: Tone } {
  switch ((status ?? "UNKNOWN").toUpperCase()) {
    case "WORKING":
      return { label: "Connected", tone: "success" };
    case "SCAN_QR_CODE":
      return { label: "Waiting for QR scan", tone: "warning" };
    case "STARTING":
      return { label: "Starting…", tone: "info" };
    case "STOPPED":
      return { label: "Stopped", tone: "neutral" };
    case "FAILED":
      return { label: "Failed", tone: "danger" };
    case "UNREACHABLE":
      return { label: "Can't reach WhatsApp service", tone: "danger" };
    default:
      return { label: "Unknown", tone: "neutral" };
  }
}

const AUDIT_WORDS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.created": "Added an admin",
  "admin.updated": "Updated an admin",
  "admin.password_changed": "Changed their password",
  "client.created": "Added a client",
  "client.updated": "Updated a client",
  "client.deleted": "Deleted a client",
  "client.signed_out": "Signed a client out everywhere",
  "client.messaged": "Sent a WhatsApp message to a client",
  "mailbox.sync": "Asked a mailbox to check now",
  "mailbox.pause": "Paused a mailbox",
  "mailbox.resume": "Resumed a mailbox",
  "mailbox.deleted": "Removed a mailbox",
  "rule.updated": "Changed a rule",
  "rule.deleted": "Deleted a rule",
  "whatsapp.start": "Started WhatsApp",
  "whatsapp.restart": "Restarted WhatsApp",
  "whatsapp.stop": "Stopped WhatsApp",
  "whatsapp.logout": "Disconnected the WhatsApp phone",
  "notification.retry": "Retried a WhatsApp message",
  "config.google_saved": "Saved Gmail settings",
  "config.google_reset": "Reset Gmail settings to environment values",
  "db.edit": "Edited a database row",
  "db.delete": "Deleted a database row",
  "db.export": "Exported a table as CSV",
  "tools.whatsapp_test": "Sent a WhatsApp test message",
};

/** "Disabled a client", "Turned a rule off", … in plain words. */
export function auditWords(row: Pick<AuditRow, "action" | "details" | "target_type">): string {
  const d = row.details ?? {};
  if (row.action === "client.updated" && d.is_active === false) return "Disabled a client";
  if (row.action === "client.updated" && d.is_active === true && Object.keys(d).length === 1) return "Enabled a client";
  if (row.action === "rule.updated" && typeof d.enabled === "boolean" && Object.keys(d).length === 1) {
    return d.enabled ? "Turned a rule on" : "Turned a rule off";
  }
  if (row.action === "admin.updated" && d.is_active === false) return "Disabled an admin";
  if (row.action === "db.edit" && row.target_type) return `Edited a row in ${row.target_type}`;
  if (row.action === "db.delete" && row.target_type) return `Deleted a row from ${row.target_type}`;
  if (row.action === "db.export" && typeof d.rows === "number") return `Exported a table as CSV (${d.rows} rows)`;
  return AUDIT_WORDS[row.action] ?? row.action.replace(/[._]/g, " ");
}

export function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/** Format an E.164 phone for display: +91 98765 43210 style grouping is region-specific, so keep it simple. */
export function phoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  return phone.startsWith("+") ? phone : `+${phone}`;
}
