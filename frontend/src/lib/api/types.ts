import type { components } from "./schema";

type S = components["schemas"];

export type User = S["UserOut"];
export type UserUpdate = S["UserUpdate"];
export type Settings = S["SettingsOut"];
export type SettingsUpdate = S["SettingsUpdate"];
export type Mailbox = S["MailboxOut"];
export type MailboxStatus = S["MailboxStatus"];
export type Provider = S["Provider"];
export type ImapPreset = S["ImapPreset"];
export type ImapMailboxCreate = S["ImapMailboxCreate"];
export type ImapCredentialsPatch = S["ImapCredentialsPatch"];
export type ImapConnection = S["ImapConnectionOut"];
export type Rule = S["RuleOut"];
export type RuleCreate = S["RuleCreate"];
export type RuleUpdate = S["RuleUpdate"];
export type FieldInfo = S["FieldInfo"];
export type RuleTestOut = S["RuleTestOut"];
export type RuleTestHit = S["RuleTestHit"];
export type SampleEmail = S["SampleEmail"];
export type Message = S["MessageOut"];
export type MessageDetail = S["MessageDetail"];
export type MessageContent = S["MessageContent"];
export type ThreadMessage = S["ThreadMessageOut"];
export type EmailFile = S["EmailFileOut"];
export type Notification = S["NotificationOut"];
export type NotificationStatus = S["NotificationStatus"];
export type NotificationKind = S["NotificationKind"];
export type Destination = S["DestinationOut"];
export type DestinationKind = S["DestinationKind"];
export type GroupLink = S["GroupLinkOut"];
export type Overview = S["Overview"];
export type DayStat = S["DayStat"];
export type DashboardStats = S["DashboardStats"];
export type ActivityDay = S["ActivityDay"];
export type NamedCount = S["NamedCount"];
export type WahaSession = S["WahaSession"];
export type QueueStats = S["QueueStats"];
export type TokenOut = S["TokenOut"];
export type EmailTemplate = S["EmailTemplateOut"];
export type EmailTemplateCreate = S["EmailTemplateCreate"];
export type EmailTemplateUpdate = S["EmailTemplateUpdate"];
export type TemplatePreview = S["TemplatePreview"];
export type OutboundEmail = S["OutboundEmailOut"];
export type OutboundEmailDetail = S["OutboundEmailDetail"];
export type OutboundStatus = S["OutboundStatus"];
export type OutboundAttachment = S["AttachmentOut"];
export type EventItem = S["EventOut"];
export type EventCreate = S["EventCreate"];
export type EventUpdate = S["EventUpdate"];
export type EventKind = S["EventKind"];
export type EventStatus = S["EventStatus"];
export type CalendarFeed = S["CalendarFeedOut"];
export type RemindRequest = S["RemindRequest"];
export type RemindOut = S["RemindOut"];
export type MuteScope = NonNullable<S["MuteRequest"]["scope"]>;
export type MuteOut = S["MuteOut"];
export type RulePack = S["RulePackOut"];
export type Suggestions = S["SuggestionsOut"];
export type PackSuggestion = S["PackSuggestion"];
export type SenderSuggestion = S["SenderSuggestionOut"];
export type SenderRuleCreate = S["SenderRuleCreate"];
export type Onboarding = S["OnboardingOut"];
export type OnboardingStep = S["OnboardingStep"];
export type TestAlertOut = S["TestAlertOut"];
export type AiStatus = S["AIStatus"];
export type Draft = S["DraftOut"];
export type ReplyIdea = S["ReplyIdeaOut"];
export type RuleIdea = S["RuleIdeaOut"];
export type AskOut = S["AskOut"];
export type AskRef = S["AskRef"];
export type ChatTurn = S["ChatTurn"];
export type OutboundCreate = S["OutboundCreate"];

export const EVENT_KINDS: EventKind[] = ["exam", "interview", "deadline", "payment", "meeting", "travel", "other"];

export const OUTBOUND_STATUSES: OutboundStatus[] = [
  "awaiting_confirmation",
  "queued",
  "sending",
  "sent",
  "failed",
  "cancelled",
  "expired",
];

export const NOTIFICATION_STATUSES: NotificationStatus[] = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "held",
  "folded",
  "failed",
  "dead",
  "cancelled",
];

/** Shape of `Overview.waha` (typed as a free-form object in the OpenAPI document). */
export interface WahaHealth {
  status?: string;
  [key: string]: unknown;
}

/** Server-sent event payloads from GET /api/v1/events. */
export interface MessageMatchedEvent {
  message_id: string;
  mailbox_address?: string | null;
  from_name?: string | null;
  from_address: string;
  subject: string;
  snippet?: string | null;
  rules: string[];
  web_url?: string | null;
  received_at?: string | null;
  /** Short WhatsApp code, e.g. "K7". */
  ref?: string | null;
  urgent?: boolean;
}

export interface NotificationUpdatedEvent {
  id: string;
  status: NotificationStatus;
}

export interface MailboxUpdatedEvent {
  id: string;
  status?: MailboxStatus;
  last_error?: string | null;
  last_synced_at?: string | null;
}

export interface DestinationLinkedEvent {
  chat_id?: string;
}

export interface SystemEvent {
  waha_status?: string;
  [key: string]: unknown;
}

export interface EmailUpdatedEvent {
  id: string;
  status: OutboundStatus;
}

export type RealtimeEventMap = {
  "email.updated": EmailUpdatedEvent;
  ready: { user_id?: string };
  "message.matched": MessageMatchedEvent;
  "notification.updated": NotificationUpdatedEvent;
  "mailbox.updated": MailboxUpdatedEvent;
  "destination.linked": DestinationLinkedEvent;
  system: SystemEvent;
};

export type RealtimeEventName = keyof RealtimeEventMap;
