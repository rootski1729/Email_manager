"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, Server } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mailboxesQuery } from "@/lib/api/queries";
import { ConnectGmailButton } from "./connect-gmail-button";
import { ConnectImapDialog } from "./connect-imap-dialog";
import { MailboxCard } from "./mailbox-card";

function OAuthReturnToast() {
  const params = useSearchParams();
  const router = useRouter();
  const connected = params.get("connected");
  const error = params.get("error");
  useEffect(() => {
    if (!connected && !error) return;
    if (connected) {
      toast.success(`Connected ${connected}`, {
        id: "oauth-return",
        description: "Gmail will notify MailSentinel the moment new mail arrives.",
      });
    } else if (error) {
      toast.error("Couldn't connect Gmail", { id: "oauth-return", description: error });
    }
    router.replace("/mailboxes", { scroll: false });
  }, [connected, error, router]);
  return null;
}

export function MailboxesView() {
  const mailboxes = useQuery(mailboxesQuery);
  const imapTrigger = (
    <Button variant="outline">
      <Server /> Connect IMAP
    </Button>
  );

  return (
    <div>
      <Suspense>
        <OAuthReturnToast />
      </Suspense>
      <PageHeader
        title="Mailboxes"
        description="Every inbox MailSentinel watches. Gmail is notified instantly by Google; IMAP mailboxes are checked every minute."
        actions={
          <>
            <ConnectImapDialog trigger={imapTrigger} />
            <ConnectGmailButton />
          </>
        }
      />
      {mailboxes.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-xl" />
          ))}
        </div>
      ) : mailboxes.isError ? (
        <ErrorState error={mailboxes.error} onRetry={() => void mailboxes.refetch()} />
      ) : mailboxes.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Connect your first mailbox"
          description="Link Gmail with one click, or add any IMAP inbox — Outlook, Yahoo, Zoho, iCloud — with an app password. MailSentinel only reads; it never sends or deletes mail."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <ConnectGmailButton />
            <ConnectImapDialog trigger={imapTrigger} />
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mailboxes.data.map((m) => (
            <MailboxCard key={m.id} mailbox={m} />
          ))}
        </div>
      )}
    </div>
  );
}
