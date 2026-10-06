import { ClipboardPaste, FileText, Paperclip, ShieldCheck, Terminal } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMANDS } from "@/lib/compose";

const STEPS = [
  { icon: Terminal, title: "Ask for a form", body: "Send /email, or /email <name> for a template." },
  { icon: Paperclip, title: "Add attachments", body: "Photos or documents you send now are attached." },
  { icon: ClipboardPaste, title: "Fill in and paste back", body: "Edit the form the bot sends and send it back." },
  { icon: ShieldCheck, title: "Confirm with YES", body: "Check the preview, then reply YES to send (or NO)." },
];

export function HowItWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-primary" /> How sending from WhatsApp works
        </CardTitle>
        <CardDescription>Write the email on WhatsApp; it goes out from your own mailbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium">{s.title}</div>
                <div className="text-muted-foreground">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Commands</h3>
          <dl className="divide-y rounded-lg border text-sm">
            {COMMANDS.map((c) => (
              <div key={c.command} className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2">
                <dt>
                  <code className="font-mono text-[12px] font-medium">{c.command}</code>
                </dt>
                <dd className="text-muted-foreground">{c.description}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          Only your own WhatsApp number can send, and nothing goes out until you reply YES.
        </p>
      </CardContent>
    </Card>
  );
}
