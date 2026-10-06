"use client";

import { AtSign, BellOff, ChevronDown, Globe } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useMuteSender } from "@/lib/api/assist";
import { useUpdateSettings } from "@/lib/api/queries";
import type { MuteScope } from "@/lib/api/types";

function domainOf(address: string) {
  return address.split("@").pop()?.toLowerCase() ?? address;
}

/** Stop WhatsApp alerts from this sender (matches still show in the app). Same as /mute K7. */
export function MuteMenu({ messageId, fromAddress }: { messageId: string; fromAddress: string }) {
  const mute = useMuteSender();
  const settings = useUpdateSettings();
  const domain = domainOf(fromAddress);

  function run(scope: MuteScope) {
    mute.mutate(
      { id: messageId, scope },
      {
        onSuccess: (out) =>
          toast.success(`Muted ${out.muted}`, {
            description: "No more WhatsApp alerts from it. Matches still appear here.",
            action: {
              label: "Undo",
              onClick: () =>
                settings.mutate(
                  { muted_senders: out.muted_senders.filter((s) => s !== out.muted) },
                  { onSuccess: () => toast.success(`Unmuted ${out.muted}`) },
                ),
            },
          }),
      },
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={mute.isPending}>
          {mute.isPending ? <Spinner /> : <BellOff />} Mute <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Stop WhatsApp alerts from…</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => run("address")}>
          <AtSign />
          <span className="min-w-0 truncate">
            This address <span className="text-muted-foreground">{fromAddress}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("domain")}>
          <Globe />
          <span className="min-w-0 truncate">
            Whole domain <span className="text-muted-foreground">{domain}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#muted-senders">Manage muted senders</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
