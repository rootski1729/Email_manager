"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, PowerOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { mailboxesQuery, settingsQuery, useUpdateSettings } from "@/lib/api/queries";
import { sendingMailboxes } from "@/lib/compose";

/** Explains why /email won't work yet: the feature is off, or no mailbox can send. */
export function ComposeBanners() {
  const settings = useQuery(settingsQuery);
  const mailboxes = useQuery(mailboxesQuery);
  const update = useUpdateSettings();

  if (settings.data && !settings.data.compose_enabled) {
    return (
      <Alert>
        <PowerOff />
        <AlertTitle>Sending from WhatsApp is turned off</AlertTitle>
        <AlertDescription>
          <p>The bot ignores /email until you turn it on. Your templates are kept either way.</p>
          <Button
            size="sm"
            className="mt-2"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ compose_enabled: true }, { onSuccess: () => toast.success("Sending from WhatsApp is on") })
            }
          >
            {update.isPending ? <Spinner /> : null} Turn on
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (mailboxes.data && sendingMailboxes(mailboxes.data).length === 0) {
    return (
      <Alert>
        <Inbox />
        <AlertTitle>No mailbox can send yet</AlertTitle>
        <AlertDescription>
          <p>
            Allow sending on a Gmail mailbox, or add SMTP details to an IMAP mailbox. Emails go out from your own
            address.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/mailboxes">Go to mailboxes</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
