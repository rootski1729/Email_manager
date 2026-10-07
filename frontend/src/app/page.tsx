import { BellRing, CalendarClock, Eye, Inbox, Lock, MessageCircle, Moon, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/common/brand";
import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { LandingCta, NavAuthLink } from "@/components/landing/landing-cta";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { APP_NAME } from "@/lib/config";

const STEPS = [
  {
    icon: Inbox,
    title: "Add your mailbox",
    body: "Gmail in one click. Outlook, Yahoo and others with an app password.",
  },
  {
    icon: Eye,
    title: "Choose what matters",
    body: "Switch on ready-made topics like exams, jobs or bank alerts — or name the senders and words yourself.",
  },
  {
    icon: MessageCircle,
    title: "Get it on WhatsApp",
    body: "Important emails reach your phone within seconds. Everything else stays quiet.",
  },
];

const FEATURES = [
  { icon: CalendarClock, title: "Never miss a date", body: "Exam dates and deadlines in your email become WhatsApp reminders." },
  { icon: Moon, title: "Quiet at night", body: "Alerts wait until morning — unless they're urgent." },
  { icon: BellRing, title: "Reply from WhatsApp", body: "Remind me later, mute a sender, or answer the email." },
  { icon: Lock, title: "Private", body: "We only read new mail to spot what's important. Nothing else is saved." },
];

const SAMPLE = [
  "📬 *Important email*  #K7",
  "*Rule:* Job interviews",
  "*From:* Talent Team <talent@acme.io>",
  "*Subject:* Interview on Thursday, 10:30",
  "",
  "> We'd like to invite you to a video interview with the team.",
  "",
  "📝 Thu 15 Oct, 10:30 – I'll remind you",
].join("\n");

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NavAuthLink />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5 text-brand-ink" aria-hidden />
                Your inbox, watched around the clock
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
                Never miss an{" "}
                <span className="text-brand-ink">important email</span>{" "}
                again.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                {APP_NAME} reads your new email for you and sends only what matters — exam notices, interview calls, bank
                alerts — straight to WhatsApp.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LandingCta />
                <a
                  href="#how"
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  How it works
                </a>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">No password — sign in with a code on WhatsApp.</p>
            </div>
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2 px-2 pt-1 pb-3 text-card-foreground">
                  <span className="flex size-8 items-center justify-center rounded-full bg-wa/20 text-wa">
                    <MessageCircle className="size-4" aria-hidden />
                  </span>
                  <div className="text-sm font-medium">{APP_NAME}</div>
                  <span className="ml-auto text-xs text-muted-foreground">online</span>
                </div>
                <WhatsAppBubble text={SAMPLE} time="10:02" className="rounded-lg" />
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up in three minutes</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">Then forget about it. We&apos;ll tap you on the shoulder when it matters.</p>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <s.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand-ink">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-medium">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-16 rounded-xl border bg-accent p-8 text-accent-foreground sm:p-10">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Ready for your next important email?
                </h2>
                <p className="mt-1 text-muted-foreground">Sign in with your WhatsApp number. It&apos;s free to start.</p>
              </div>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-lg bg-primary px-6 text-[15px] font-medium text-primary-foreground outline-none hover:bg-primary/88 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand className="text-foreground" />
          <span>Important email, straight to WhatsApp.</span>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
