"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useMessageClient } from "@/lib/admin/queries";
import type { ClientRow } from "@/lib/admin/types";

const MAX = 2000;

export function MessageClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: ClientRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const send = useMessageClient();
  const [text, setText] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a WhatsApp message</DialogTitle>
          <DialogDescription>
            Goes to {client.display_name || client.phone_e164} through the normal WhatsApp queue.
          </DialogDescription>
        </DialogHeader>
        <form
          id="message-client"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send.mutate(
              { id: client.id, text: text.trim() },
              {
                onSuccess: () => {
                  toast.success("Message queued — it will arrive shortly");
                  setText("");
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor="client-message">Message</FieldLabel>
            <Textarea
              id="client-message"
              rows={5}
              maxLength={MAX}
              value={text}
              placeholder="Hi! We noticed your Gmail needs reconnecting…"
              onChange={(e) => setText(e.target.value)}
            />
            <FieldDescription className="flex justify-between">
              <span>WhatsApp formatting like *bold* works.</span>
              <span className="tabular">
                {text.length}/{MAX}
              </span>
            </FieldDescription>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="message-client" disabled={!text.trim() || send.isPending}>
            {send.isPending ? <Spinner /> : null} Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
