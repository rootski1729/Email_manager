import {
  BellRing,
  Clock3,
  Inbox,
  ListFilter,
  Lock,
  MessageCircle,
  Network,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/common/brand";
import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { LandingCta, NavAuthLink } from "@/components/landing/landing-cta";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { APP_NAME } from "@/lib/config";

const STEPS = [
  {
    icon: Inbox,
    title: "Connect your mailboxes",
    body: "Link Gmail in one click, or any IMAP inbox — Outlook, Yahoo, Zoho, iCloud — with an app password.",
  },
  {
    icon: ListFilter,
    title: "Describe what matters",
    body: "Build rules from sender, domain and subdomains, recipients, subject, body, headers and attachments with AND, OR and NOT.",
  },
  {
    icon: MessageCircle,
    title: "Get it on WhatsApp",
    body: "Matches arrive on your number or a group within seconds, with the sender, subject, a snippet and a link back.",
  },
];

const FEATURES = [
  { icon: Network, title: "Subdomain-aware", body: "univ.edu also catches exam.univ.edu — never notuniv.edu." },
  { icon: Clock3, title: "Quiet hours & digests", body: "Hold alerts overnight and roll them into one tidy summary." },
  { icon: BellRing, title: "Delivery you can see", body: "Every alert is tracked through sent, delivered and read." },
  { icon: Lock, title: "Private by design", body: "Bodies of mail that doesn't match are never stored." },
];

const SAMPLE = [
  "📬 *Important email*",
  "*Rule:* Interview calls",
  "*Inbox:* careers@yourmail.com",
  "*From:* Talent Team <talent@acme.io>",
  "*Subject:* Interview scheduled — Thursday 10:30",
  "",
  "> We'd like to invite you to a technical interview with the platform team.",
].join("\n");

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NavAuthLink />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <div aria-hidden className="absolute top-[-10rem] left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                Your inbox, on watch around the clock
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
                Never miss the email{" "}
                <span className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-transparent">
                  that matters.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                {APP_NAME} watches all your mailboxes, picks out exam notices, admit cards and interview calls with
                rules you control, and sends them straight to WhatsApp.
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
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="rounded-2xl border bg-card p-2 shadow-2xl shadow-primary/10">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-wa/15 text-wa">
                    <MessageCircle className="size-4" />
                  </span>
                  <div className="text-sm font-medium">{APP_NAME}</div>
                  <span className="ml-auto text-xs text-muted-foreground">online</span>
                </div>
                <WhatsAppBubble text={SAMPLE} time="10:02" />
              </div>
              <div className="absolute -bottom-5 -left-4 hidden rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:block">
                <div className="font-medium">from.domain is in domain</div>
                <div className="font-mono text-muted-foreground">acme.io</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">Set it up once in about three minutes.</p>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border bg-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <s.icon className="size-5" />
                    </span>
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Step {i + 1}
                    </span>
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
                <f.icon className="size-5 text-primary" />
                <h3 className="mt-3 font-medium">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-brand-2/10 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Ready when your next important email is.</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign in with your WhatsApp number — no password.</p>
            </div>
            <LandingCta size="default" label="Sign in" />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand className="text-foreground" />
          <span>Alerts are delivered through a self-hosted WhatsApp gateway.</span>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
