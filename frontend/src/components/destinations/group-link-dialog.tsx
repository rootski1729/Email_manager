"use client";

import { Clock, Link2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useStartGroupLink } from "@/lib/api/queries";
import type { GroupLink } from "@/lib/api/types";
import { useSecondTicker } from "@/lib/hooks/use-now";
import { useRealtimeEvent } from "@/lib/realtime/realtime-provider";

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function GroupLinkDialog() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<(GroupLink & { expiresAt: number }) | null>(null);
  const start = useStartGroupLink();
  const now = useSecondTicker(open && Boolean(link));
  const remaining = link ? Math.max(0, link.expiresAt - now) : 0;
  const expired = Boolean(link) && remaining === 0;

  useRealtimeEvent("destination.linked", () => {
    if (!open) return;
    toast.success("WhatsApp group linked", { description: "You can now send alerts to the group." });
    setOpen(false);
    setLink(null);
  });

  function generate() {
    start.mutate(undefined, {
      onSuccess: (l) => setLink({ ...l, expiresAt: Math.floor(Date.now() / 1000) + l.expires_in }),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLink(null);
      }}
    >
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          generate();
        }}
      >
        <Users /> Link a group
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" /> Link a WhatsApp group
          </DialogTitle>
          <DialogDescription>Send alerts to a group — handy for a family or a team.</DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="flex h-40 items-center justify-center">
            {start.isError ? (
              <Button variant="outline" onClick={generate}>
                Try again
              </Button>
            ) : (
              <Spinner className="size-6 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span>
                  Add{" "}
                  {link.bot_number ? (
                    <span className="font-medium tabular">+{link.bot_number.replace(/^\+/, "")}</span>
                  ) : (
                    "the MailSentinel WhatsApp number"
                  )}{" "}
                  to the group.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span>Send this code as a message in the group:</span>
              </li>
            </ol>
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
              <code className={`font-mono text-2xl font-semibold tracking-[0.2em] ${expired ? "text-muted-foreground line-through" : ""}`}>
                {link.code}
              </code>
              <CopyButton value={link.code} />
            </div>
            {link.instructions ? <p className="text-xs whitespace-pre-line text-muted-foreground">{link.instructions}</p> : null}
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground" aria-live="polite">
                <Clock className="size-3.5" />
                {expired ? "This code has expired." : `Expires in ${formatCountdown(remaining)}`}
              </span>
              {!expired ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Spinner className="size-3" /> Waiting for the group…
                </span>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {expired ? (
            <Button onClick={generate} disabled={start.isPending}>
              {start.isPending ? <Spinner /> : null} New code
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
