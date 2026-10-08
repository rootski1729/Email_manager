"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-provider";

export function LandingCta({ size = "lg", label = "Get started" }: { size?: "lg" | "default"; label?: string }) {
  const { status } = useAuth();
  const authed = status === "authenticated";
  return (
    <Button asChild variant="highlight" size={size} className={cn("landing-shine", size === "lg" && "h-11 px-5 text-[15px]")}>
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
