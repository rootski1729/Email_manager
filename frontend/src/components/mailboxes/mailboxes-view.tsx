"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { mailboxesQuery } from "@/lib/api/queries";
import { AddMailboxButton, AddMailboxDialog } from "./add-mailbox-dialog";
import { MailboxCard } from "./mailbox-card";

/** Handles ?connected= / ?error= after Google sends you back, and ?add=1 from Home. */
function UrlActions({ onAdd }: { onAdd: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const connected = params.get("connected");
  const error = params.get("error");
  const add = params.get("add");
  useEffect(() => {
    if (!connected && !error && !add) return;
    if (connected) {
      toast.success(`${connected} is connected`, {
        id: "oauth-return",
        description: "Gmail now tells us the moment a new email arrives.",
      });
    } else if (error) {
      toast.error("Couldn't connect Gmail", { id: "oauth-return", description: error });
    } else if (add) {
      onAdd();
    }
    router.replace(pathname, { scroll: false });
  }, [connected, error, add, router, pathname, onAdd]);
  return null;
}

export function MailboxesView() {
  const mailboxes = useQuery(mailboxesQuery);
  const [adding, setAdding] = useState(false);
  const openAdd = useCallback(() => setAdding(true), []);

  return (
    <div>
      <Suspense>
        <UrlActions onAdd={openAdd} />
      </Suspense>
      <PageHeader
        title="Mailboxes"
        description="The email accounts we check for you. New Gmail arrives instantly; other mailboxes are checked every minute."
        actions={mailboxes.data?.length ? <AddMailboxButton onClick={openAdd} /> : null}
      />
      {mailboxes.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : mailboxes.isError ? (
        <ErrorState error={mailboxes.error} onRetry={() => void mailboxes.refetch()} />
      ) : mailboxes.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Add your first mailbox"
          description="Gmail, Outlook, Yahoo or any other email. It takes about a minute."
        >
          <AddMailboxButton onClick={openAdd} />
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mailboxes.data.map((m) => (
            <MailboxCard key={m.id} mailbox={m} />
          ))}
        </div>
      )}
      <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        We only read new email to spot what&apos;s important. We never delete or change anything, and emails that
        aren&apos;t important are never saved.
      </p>
      <AddMailboxDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
