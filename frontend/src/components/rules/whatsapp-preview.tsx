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
}: {
  ruleName: string;
  hit: RuleTestHit | null;
  mailbox: string | null;
  mode: "instant" | "digest";
}) {
  const origin = useOrigin();
  const text = renderAlertPreview({
    rules: [ruleName.trim() || "Untitled rule"],
    mailbox: mailbox ?? "you@example.com",
    fromName: hit ? hit.from_name : "Examination Cell",
    fromAddress: hit ? hit.from_address : "exams@univ.edu",
    subject: hit ? hit.subject : "Admit card released for end-semester examinations",
    snippet: hit ? hit.snippet : "Your admit card is now available on the student portal. Download it before the deadline.",
    detailsUrl: origin ? `${origin}/messages/…` : null,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-wa" /> WhatsApp preview
        </CardTitle>
        <CardDescription>
          {hit ? "Using the first match from your test." : "Example alert — run a test to preview a real match."}
          {mode === "digest" ? " Digest mode bundles matches into one summary message instead." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WhatsAppBubble text={text} />
      </CardContent>
    </Card>
  );
}
