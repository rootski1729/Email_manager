"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-card text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">An unexpected error occurred while showing this page.</p>
      </div>
      <Button onClick={reset}>
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
