import { ClipboardPaste, MessageCircle, Paperclip, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMANDS } from "@/lib/compose";

const STEPS = [
  { icon: MessageCircle, title: "Send /email", body: "Or /email leave for a template." },
  { icon: Paperclip, title: "Add files", body: "Optional: send photos or PDFs." },
  { icon: ClipboardPaste, title: "Fill in the form", body: "Edit the reply and send it back." },
  { icon: ShieldCheck, title: "Reply YES", body: "Nothing goes out before that." },
];

export function HowItWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How it works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium">{s.title}</div>
                <div className="text-muted-foreground">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <details className="text-sm">
          <summary className="cursor-pointer rounded-md text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            All email commands
          </summary>
          <dl className="mt-2 divide-y rounded-xl border">
            {COMMANDS.map((c) => (
              <div key={c.command} className="grid grid-cols-1 gap-0.5 px-3 py-2 min-[420px]:grid-cols-[7.5rem_1fr] min-[420px]:gap-2">
                <dt>
                  <code className="font-mono text-[12px] font-medium">{c.command}</code>
                </dt>
                <dd className="text-muted-foreground">{c.description}</dd>
              </div>
            ))}
          </dl>
        </details>
        <p className="flex gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          Only your own WhatsApp number can send email.
        </p>
      </CardContent>
    </Card>
  );
}
