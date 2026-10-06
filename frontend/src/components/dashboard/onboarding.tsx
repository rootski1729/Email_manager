import { Check, Inbox, ListFilter, MessageCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  done: boolean;
  title: string;
  body: string;
  href: string;
  cta: string;
  icon: typeof Inbox;
}

export function Onboarding({
  hasMailbox,
  hasRule,
  hasDestination,
}: {
  hasMailbox: boolean;
  hasRule: boolean;
  hasDestination: boolean;
}) {
  const steps: Step[] = [
    {
      done: hasMailbox,
      title: "Connect a mailbox",
      body: "Gmail in one click, or any IMAP inbox with an app password.",
      href: "/mailboxes",
      cta: "Connect mailbox",
      icon: Inbox,
    },
    {
      done: hasRule,
      title: "Create your first rule",
      body: "Tell MailSentinel which emails are important — by sender, domain, subject and more.",
      href: "/rules/new",
      cta: "Create rule",
      icon: ListFilter,
    },
    {
      done: hasDestination,
      title: "Choose where alerts go",
      body: "Alerts go to your own number by default. Add another number or a WhatsApp group anytime.",
      href: "/destinations",
      cta: "Review destinations",
      icon: MessageCircle,
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/8 via-card to-brand-2/8">
      <div className="flex flex-col gap-1 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold tracking-tight">Get set up</h2>
          <p className="text-sm text-muted-foreground">Three quick steps and important email starts reaching WhatsApp.</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <ol className="grid gap-px bg-border md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className={cn("flex flex-col gap-3 bg-card p-5", i === next && "bg-card/95")}>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-sm font-semibold",
                  s.done ? "border-transparent bg-emerald-500 text-white" : i === next ? "border-primary text-primary" : "text-muted-foreground",
                )}
              >
                {s.done ? <Check className="size-4" /> : i + 1}
              </span>
              <h3 className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{s.body}</p>
            {!s.done ? (
              <Button asChild size="sm" variant={i === next ? "default" : "outline"} className="mt-auto w-fit">
                <Link href={s.href}>
                  <s.icon /> {s.cta}
                </Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
