"use client";

import { useAuth } from "@/lib/auth/auth-provider";
import { browserZone } from "@/lib/datetime";

/** The user's profile time zone (reminders and all-day dates use it), falling back to the browser's. */
export function useZone(): string {
  const { user } = useAuth();
  return user?.timezone || browserZone();
}
