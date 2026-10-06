"use client";

import { MessageCircle } from "lucide-react";

import { renderAlertPreview, WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RuleTestHit } from "@/lib/api/types";
import { useOrigin } from "@/lib/hooks/use-origin";

export function WhatsAppPreview({
  ruleName,
  hit,
  mailbox,
  mode,
  urgent = false,
}: {
  ruleName: string;
  hit: RuleTestHit | null;
  mailbox: string | null;
  mode: "instant" | "digest";
  urgent?: boolean;
}) {
  const origin = useOrigin();
  const text = renderAlertPreview({
    rules: [ruleName.trim() || "My rule"],
    mailbox: mailbox ?? "you@example.com",
    fromName: hit ? hit.from_name : "Examination Cell",
    fromAddress: hit ? hit.from_address : "exams@univ.edu",
    subject: hit ? hit.subject : "Admit card released for end-semester examinations",
    snippet: hit ? hit.snippet : "Your admit card is now available on the student portal. Download it before the deadline.",
    detailsUrl: origin ? `${origin}/messages/…` : null,
    urgent,
    ref: "K7",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-wa" /> What you&apos;ll get on WhatsApp
        </CardTitle>
        <CardDescription>
          {hit ? "Using the first email your test caught." : "An example. Try it on your email to see a real one."}
          {urgent
            ? " Urgent alerts arrive immediately, even during quiet hours."
            : mode === "digest"
              ? " These are collected into one daily summary message instead."
              : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WhatsAppBubble text={text} />
      </CardContent>
    </Card>
  );
}
