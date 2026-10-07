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
  "📬 *Important email*  #K7",
  "*Rule:* University exams",
  "*From:* Examination Cell <exam@univ.edu>",
  "*Subject:* Admit card released for end-semester exams",
  "",
  "> Download your admit card from the student portal before Friday.",
].join("\n");

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Brand />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-2 mb-8 text-muted-foreground text-pretty">
            Sign in with your WhatsApp number. No password needed.
          </p>
          <div className="rounded-2xl border bg-card p-5 shadow-md sm:p-6">
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-6 text-xs text-muted-foreground text-pretty">
            New here? Signing in creates your account. We only use your number to sign you in and send your alerts.
          </p>
        </div>
      </div>
      <div className="hidden rounded-3xl border border-hero-border bg-hero text-hero-foreground lg:m-3 lg:flex lg:items-center lg:justify-center">
        <div className="w-full max-w-md px-8">
          <span aria-hidden className="mb-6 block h-1 w-12 rounded-full bg-brand" />
          <p className="mb-4 text-sm font-medium text-hero-muted">What lands on your phone</p>
          <WhatsAppBubble text={SAMPLE} time="09:41" className="rounded-2xl shadow-xl" />
          <p className="mt-8 text-2xl font-semibold tracking-tight text-balance">
            The emails that matter, on the app you actually check.
          </p>
        </div>
      </div>
    </div>
  );
}
