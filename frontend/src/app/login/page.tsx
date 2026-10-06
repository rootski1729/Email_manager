import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { Brand } from "@/components/common/brand";
import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

const SAMPLE = [
  "📬 *Important email*",
  "*Rule:* University exams",
  "*Inbox:* you@gmail.com",
  "*From:* Examination Cell <exam@univ.edu>",
  "*Subject:* Admit card released for end-semester examinations",
  "",
  "> Download your admit card from the student portal before Friday.",
].join("\n");

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Brand />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">
            No password needed — we verify you through WhatsApp.
          </p>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-8 text-xs text-muted-foreground">
            New here? Signing in creates your account. Your number is used only to sign you in and deliver your alerts.
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-muted/40 lg:flex lg:items-center lg:justify-center">
        <div aria-hidden className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div aria-hidden className="absolute -top-24 -right-24 size-96 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-2/20 blur-3xl" />
        <div className="relative w-full max-w-md px-8">
          <p className="mb-4 text-sm font-medium text-muted-foreground">What lands on your phone</p>
          <div className="rounded-2xl border bg-card p-2 shadow-xl shadow-primary/5">
            <WhatsAppBubble text={SAMPLE} time="09:41" />
          </div>
          <p className="mt-6 text-lg font-medium tracking-tight text-balance">
            The emails that matter, on the app you actually check.
          </p>
        </div>
      </div>
    </div>
  );
}
