"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/auth-provider";
import { initials } from "@/lib/format";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const name = user?.display_name || user?.phone_e164 || "Account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand/15 text-[11px] font-semibold text-brand-ink">
              {user?.display_name ? initials(user.display_name) : <UserRound className="size-3.5" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{name}</div>
          {user?.display_name ? (
            <div className="truncate text-xs text-muted-foreground">{user.phone_e164}</div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
