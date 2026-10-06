import { Compass } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/common/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <Brand />
      <div className="flex size-12 items-center justify-center rounded-xl border bg-card text-brand-ink">
        <Compass className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">The link may be old, or the page has moved.</p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Go home</Link>
      </Button>
    </div>
  );
}
