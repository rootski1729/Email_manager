import { BellRing, CalendarClock, Eye, Inbox, Lock, MessageCircle, Moon, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/common/brand";
import { LandingCta, NavAuthLink } from "@/components/landing/landing-cta";
import { PhoneMock } from "@/components/landing/phone-mock";
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
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NavAuthLink />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-hero-border bg-linear-to-b from-hero to-background text-hero-foreground">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink">
                <ShieldCheck className="size-4" aria-hidden />
                Your inbox, watched around the clock
              </span>
              <h1 className="mt-5 text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4rem]">
                Never miss an{" "}
                <span className="text-brand dark:text-brand-ink">important email</span>{" "}
                again.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-hero-muted text-pretty">
                {APP_NAME} reads your new email for you and sends only what matters — exam notices, interview calls, bank
                alerts — straight to WhatsApp.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-2">
                <LandingCta />
                <a
                  href="#how"
                  className="inline-flex h-11 items-center rounded-lg px-4 text-[15px] font-medium text-hero-foreground outline-none hover:bg-hero-border/60 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  How it works
                </a>
              </div>
              <p className="mt-5 text-sm text-hero-muted">No password — sign in with a code on WhatsApp.</p>
            </div>
            <PhoneMock text={SAMPLE} time="10:02" />
          </div>
        </section>

        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Set up in three minutes</h2>
            <p className="mt-3 max-w-xl text-lg text-muted-foreground">Then forget about it. We&apos;ll tap you on the shoulder when it matters.</p>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-brand-ink uppercase">Step {i + 1}</span>
                    <s.icon className="size-5 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-4 py-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-brand-ink" aria-hidden />
                <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <div className="flex flex-col items-start gap-8 rounded-2xl border border-hero-border bg-hero px-6 py-10 text-hero-foreground sm:px-12 sm:py-14 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                  Ready for your next important email?
                </h2>
                <p className="mt-2 text-hero-muted">Sign in with your WhatsApp number. It&apos;s free to start.</p>
              </div>
              <Link
                href="/login"
                className="inline-flex h-11 shrink-0 items-center rounded-lg bg-brand px-5 text-[15px] font-medium text-brand-foreground shadow-xs outline-none hover:bg-brand/90 focus-visible:ring-3 focus-visible:ring-ring"
              >
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand className="text-foreground" />
          <span>Important email, straight to WhatsApp.</span>
          <Link href="/login" className="rounded-md font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
