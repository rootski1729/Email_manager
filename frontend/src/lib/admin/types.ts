import type { components } from "@/lib/api/schema";

type S = components["schemas"];

export type AdminOut = S["AdminOut"];
export type AdminTokenOut = S["AdminTokenOut"];
export type AdminCreate = S["AdminCreate"];
export type AdminUpdate = S["AdminUpdate"];
export type AdminOverview = S["AdminOverview"];
export type DayCount = S["DayCount"];
export type HealthItem = S["HealthItem"];
export type WahaSession = S["WahaSession"];
export type NotificationOut = S["NotificationOut"];
export type NotificationStatus = S["NotificationStatus"];
export type AuditRow = S["AuditRow"];
export type ClientRow = S["ClientRow"];
export type ClientPage = S["ClientPage"];
export type ClientCreate = S["ClientCreate"];
export type ClientUpdate = S["ClientUpdate"];
export type ClientDetail = S["ClientDetail"];
export type ClientMessageRow = S["ClientMessageRow"];
export type AdminMailboxRow = S["AdminMailboxRow"];
export type MailboxStatus = S["MailboxStatus"];
export type AdminRuleRow = S["AdminRuleRow"];
export type GoogleConfigIn = S["GoogleConfigIn"];
export type GoogleConfigOut = S["GoogleConfigOut"];
export type CheckResult = S["CheckResult"];
export type ToolRuleTest = S["ToolRuleTest"];
export type ToolRuleResult = S["ToolRuleResult"];
export type ToolDates = S["ToolDates"];
export type ToolDateFound = S["ToolDateFound"];
export type ToolMailbox = S["ToolMailbox"];
export type ImapCredentials = S["ImapCredentials"];
export type DbTable = S["DbTable"];
export type DbColumn = S["DbColumn"];
export type DbRows = S["DbRows"];

export type WahaAction = "start" | "restart" | "stop" | "logout";
export type MailboxAction = "sync" | "pause" | "resume";

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const MAILBOX_STATUSES: MailboxStatus[] = ["active", "paused", "reauth_required", "error"];
