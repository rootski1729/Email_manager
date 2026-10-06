import type { MailboxStatus, NotificationStatus, OutboundStatus } from "@/lib/api/types";

export type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; text: string }> = {
  success: {
    badge: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    badge: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-200 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    text: "text-amber-800 dark:text-amber-200",
  },
  danger: {
    badge: "bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300 dark:ring-rose-400/25",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
  },
  info: {
    badge: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300 dark:ring-sky-400/25",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  brand: {
    badge: "bg-primary/10 text-primary ring-primary/20",
    dot: "bg-primary",
    text: "text-primary",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
};

export const MAILBOX_STATUS: Record<MailboxStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  reauth_required: { label: "Reconnect needed", tone: "warning" },
  error: { label: "Error", tone: "danger" },
};

export const NOTIFICATION_STATUS: Record<NotificationStatus, { label: string; tone: Tone; hint: string }> = {
  queued: { label: "Queued", tone: "neutral", hint: "Waiting for its turn to send." },
  sending: { label: "Sending", tone: "info", hint: "Being handed to WhatsApp right now." },
  sent: { label: "Sent", tone: "brand", hint: "Accepted by WhatsApp." },
  delivered: { label: "Delivered", tone: "success", hint: "Delivered to the phone." },
  read: { label: "Read", tone: "success", hint: "Opened on the phone." },
  held: { label: "Held", tone: "warning", hint: "Held back by quiet hours or the daily cap." },
  folded: { label: "In digest", tone: "neutral", hint: "Folded into a digest message." },
  failed: { label: "Failed", tone: "danger", hint: "The last attempt failed; it will be retried." },
  dead: { label: "Dead", tone: "danger", hint: "Gave up after the maximum number of attempts." },
};

export function wahaStatus(status: string | undefined | null): { label: string; tone: Tone } {
  switch ((status ?? "UNKNOWN").toUpperCase()) {
    case "WORKING":
      return { label: "Connected", tone: "success" };
    case "SCAN_QR_CODE":
      return { label: "Waiting for QR scan", tone: "warning" };
    case "STARTING":
      return { label: "Starting", tone: "info" };
    case "STOPPED":
      return { label: "Stopped", tone: "neutral" };
    case "FAILED":
      return { label: "Failed", tone: "danger" };
    case "UNREACHABLE":
      return { label: "Unreachable", tone: "danger" };
    default:
      return { label: "Unknown", tone: "neutral" };
  }
}

export const OUTBOUND_STATUS: Record<OutboundStatus, { label: string; tone: Tone; hint: string }> = {
  awaiting_confirmation: { label: "Awaiting YES", tone: "warning", hint: "Waiting for you to reply YES on WhatsApp." },
  queued: { label: "Queued", tone: "neutral", hint: "Confirmed and waiting to send." },
  sending: { label: "Sending", tone: "info", hint: "Being handed to your mail provider." },
  sent: { label: "Sent", tone: "success", hint: "Accepted by your mail provider." },
  failed: { label: "Failed", tone: "danger", hint: "The mail provider rejected it." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Cancelled before sending." },
  expired: { label: "Expired", tone: "neutral", hint: "Not confirmed in time, so it was never sent." },
};
