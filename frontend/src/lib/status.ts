import type { MailboxStatus, NotificationStatus, OutboundStatus } from "@/lib/api/types";

export type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; text: string }> = {
  success: {
    badge: "bg-success/12 text-success ring-success/25",
    dot: "bg-success",
    text: "text-success",
  },
  warning: {
    badge: "bg-warning/12 text-warning ring-warning/30",
    dot: "bg-warning",
    text: "text-warning",
  },
  danger: {
    badge: "bg-destructive/10 text-destructive ring-destructive/25",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  info: {
    badge: "bg-info/12 text-info ring-info/25",
    dot: "bg-info",
    text: "text-info",
  },
  brand: {
    badge: "bg-brand/15 text-brand-ink ring-brand/35",
    dot: "bg-brand",
    text: "text-brand-ink",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
};

export const MAILBOX_STATUS: Record<MailboxStatus, { label: string; tone: Tone }> = {
  active: { label: "Connected", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  reauth_required: { label: "Needs reconnecting", tone: "warning" },
  error: { label: "Having trouble", tone: "danger" },
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
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Cancelled before it was sent, e.g. a reminder for a date that changed." },
};

/**
 * Plain-language delivery states for clients (the technical labels above stay for the admin console).
 * Several internal states collapse into one simple word.
 */
export const ALERT_STATUS: Record<NotificationStatus, { label: string; tone: Tone; hint: string }> = {
  queued: { label: "Waiting", tone: "neutral", hint: "It will go out in a moment." },
  sending: { label: "Sending", tone: "info", hint: "On its way to WhatsApp right now." },
  sent: { label: "Sent", tone: "brand", hint: "WhatsApp accepted it." },
  delivered: { label: "Delivered", tone: "success", hint: "It reached the phone." },
  read: { label: "Read", tone: "success", hint: "It was opened on the phone." },
  held: { label: "Waiting", tone: "warning", hint: "Held for quiet hours or today's limit. It goes out later." },
  folded: { label: "In your summary", tone: "neutral", hint: "Included in a summary message instead of on its own." },
  failed: { label: "Retrying", tone: "warning", hint: "The last try didn't work. We'll try again automatically." },
  dead: { label: "Failed", tone: "danger", hint: "We couldn't deliver it. You can try again." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Not needed any more, e.g. a reminder for a date that changed." },
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
