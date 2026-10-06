"use client";

import { MessageCircle } from "lucide-react";

import { CopyButton } from "@/components/common/copy-button";
import { WhatsAppThread } from "@/components/common/whatsapp-bubble";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INSTRUCTIONS } from "@/lib/compose";

export function TemplatePreviewCard({
  command,
  instructions = INSTRUCTIONS,
  form,
  exact,
}: {
  command: string;
  instructions?: string;
  form: string;
  /** True when this is the server's own rendering of a saved template. */
  exact: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-wa" /> WhatsApp preview
        </CardTitle>
        <CardDescription>
          {exact
            ? "Exactly what the bot replies to this command."
            : "Live preview of your unsaved changes. Placeholders use today's date and your name."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <WhatsAppThread
          messages={[
            { from: "me", text: command },
            { from: "bot", text: instructions },
            { from: "bot", text: form },
          ]}
        />
        <div className="flex items-center justify-between gap-2">
          <code className="truncate rounded bg-muted px-2 py-1 font-mono text-xs">{command}</code>
          <CopyButton value={command} label="Copy command" />
        </div>
      </CardContent>
    </Card>
  );
}
