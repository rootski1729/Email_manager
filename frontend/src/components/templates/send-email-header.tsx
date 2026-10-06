"use client";

import { FileText, Send } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "templates", href: "/templates", label: "Templates", icon: FileText },
  { id: "sent", href: "/sent", label: "Sent", icon: Send },
] as const;

/** Shared header for the "Send email" section: one title, two tabs (Templates · Sent). */
export function SendEmailHeader({ active, actions }: { active: "templates" | "sent"; actions?: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Send email"
        description="Write an email on WhatsApp and it goes out from your own mailbox. Templates fill in the usual parts for you."
        actions={actions}
        className="pb-0"
      />
      <nav aria-label="Send email" className="flex gap-1 border-b">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" aria-hidden /> {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
