"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";

export function LandingCta({ size = "lg", label = "Get started" }: { size?: "lg" | "default"; label?: string }) {
  const { status } = useAuth();
  const authed = status === "authenticated";
  return (
    <Button asChild variant="highlight" size={size} className={size === "lg" ? "h-12 px-6 text-[15px]" : undefined}>
      <Link href={authed ? "/dashboard" : "/login"}>
        {authed ? "Open MailSentinel" : label}
        <ArrowRight />
      </Link>
    </Button>
  );
}

export function NavAuthLink() {
  const { status } = useAuth();
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={status === "authenticated" ? "/dashboard" : "/login"}>
        {status === "authenticated" ? "Open MailSentinel" : "Sign in"}
      </Link>
    </Button>
  );
}
