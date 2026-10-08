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
import { cn } from "@/lib/utils";

/** The account menu. With `greeting`, wide screens also show "Hello, {first name}" beside the avatar. */
export function UserMenu({ greeting = false }: { greeting?: boolean }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const name = user?.display_name || user?.phone_e164 || "Account";
  const first = user?.display_name?.trim().split(/\s+/)[0];
  const hello = greeting && first;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("rounded-full", hello && "lg:w-auto lg:gap-2.5 lg:py-0 lg:pr-1 lg:pl-3")}
          aria-label="Account menu"
        >
          {hello ? (
            <span className="hidden text-sm font-normal text-muted-foreground lg:inline">
              Hello, <span className="font-semibold text-foreground">{first}</span>
            </span>
          ) : null}
          <Avatar className={cn("size-7", hello && "lg:size-8")}>
            <AvatarFallback className="bg-brand text-[11px] font-semibold text-brand-foreground">
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
