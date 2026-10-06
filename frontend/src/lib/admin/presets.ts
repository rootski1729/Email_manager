/** Ready-made inputs for the test lab. */

const NOT_NEWSLETTER = { not: { field: "header:List-Unsubscribe", op: "exists" } };

export interface ConditionPreset {
  id: string;
  label: string;
  condition: Record<string, unknown>;
}

export const CONDITION_PRESETS: ConditionPreset[] = [
  {
    id: "exams",
    label: "Exams & results pack",
    condition: {
      all: [
        {
          any: [
            { field: "subject", op: "contains", value: ["admit card", "hall ticket", "date sheet", "exam schedule", "examination", "result declared", "re-exam"] },
            { field: "body", op: "contains", value: ["admit card", "hall ticket", "date sheet", "exam schedule", "examination", "result declared", "re-exam"] },
          ],
        },
        NOT_NEWSLETTER,
      ],
    },
  },
  {
    id: "jobs",
    label: "Jobs & interviews pack",
    condition: {
      all: [
        { field: "subject", op: "contains", value: ["interview", "shortlisted", "offer letter", "assessment", "next round"] },
        NOT_NEWSLETTER,
      ],
    },
  },
  {
    id: "bank",
    label: "Bank & payments pack",
    condition: {
      all: [
        { field: "subject", op: "contains", value: ["debited", "credited", "transaction alert", "payment failed", "statement"] },
        NOT_NEWSLETTER,
      ],
    },
  },
  {
    id: "domain",
    label: "Anything from one domain",
    condition: { field: "from.domain", op: "domain_matches", value: "univ.edu" },
  },
  {
    id: "attachment",
    label: "Invoice with an attachment",
    condition: {
      all: [
        { field: "subject", op: "contains", value: ["invoice", "bill"] },
        { field: "has_attachment", op: "is", value: true },
      ],
    },
  },
];

export const SAMPLE_EMAIL = {
  from_address: "exam@univ.edu",
  from_name: "Examination Cell",
  to: "student@gmail.com",
  subject: "Admit card released for end-semester examinations",
  body: "Dear student,\n\nYour admit card for the end-semester examinations is now available on the student portal. Download it before Friday, 14 November.\n\nExamination Cell",
  headers: "",
  attachments: "",
};

export const SAMPLE_DATES = {
  subject: "Interview scheduled – Software Engineer (Round 2)",
  body:
    "Hi,\n\nThanks for your interest. Your technical interview is scheduled for Monday, 12 October at 3:30 PM IST on Google Meet.\n\nPlease submit the take-home assignment by 10 Oct 2026, 11:59 PM.\n\nRegards,\nHiring Team",
};

export interface MailHostPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  security: "ssl" | "plain";
  smtp_host: string;
  smtp_port: number;
  smtp_security: "ssl" | "starttls" | "plain";
  note?: string;
}

export const MAIL_HOST_PRESETS: MailHostPreset[] = [
  { id: "gmail", label: "Gmail (app password)", host: "imap.gmail.com", port: 993, security: "ssl", smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_security: "ssl", note: "Needs 2-step verification and an app password." },
  { id: "outlook", label: "Outlook / Hotmail", host: "outlook.office365.com", port: 993, security: "ssl", smtp_host: "smtp.office365.com", smtp_port: 587, smtp_security: "starttls" },
  { id: "yahoo", label: "Yahoo Mail", host: "imap.mail.yahoo.com", port: 993, security: "ssl", smtp_host: "smtp.mail.yahoo.com", smtp_port: 465, smtp_security: "ssl", note: "Needs an app password." },
  { id: "zoho", label: "Zoho Mail", host: "imap.zoho.com", port: 993, security: "ssl", smtp_host: "smtp.zoho.com", smtp_port: 465, smtp_security: "ssl" },
  { id: "icloud", label: "iCloud Mail", host: "imap.mail.me.com", port: 993, security: "ssl", smtp_host: "smtp.mail.me.com", smtp_port: 587, smtp_security: "starttls", note: "Needs an app-specific password." },
];
