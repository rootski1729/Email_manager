import { MessageCircle } from "lucide-react";

import { WhatsAppBubble } from "@/components/common/whatsapp-bubble";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/** A small phone with an alert open in WhatsApp: the one illustration on the public pages. */
export function PhoneMock({ text, time, className }: { text: string; time: string; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[22rem] rounded-[2.25rem] border bg-card p-2 shadow-xl", className)}>
      <div className="overflow-hidden rounded-[1.75rem] border bg-wa-canvas">
        <div className="flex items-center gap-2.5 border-b bg-card px-4 pt-4 pb-3 text-card-foreground">
          <span className="flex size-8 items-center justify-center rounded-full bg-wa/15 text-wa">
            <MessageCircle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-medium">{APP_NAME}</div>
            <div className="text-xs text-muted-foreground">online</div>
          </div>
        </div>
        <WhatsAppBubble text={text} time={time} className="rounded-none bg-transparent px-3 pt-5 pb-6 sm:px-3 sm:pt-5 sm:pb-6" />
      </div>
    </div>
  );
}
