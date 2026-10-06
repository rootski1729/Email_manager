import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { StatusIcon } from "@/components/admin/common/status-icon";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HEALTH_FIX } from "@/lib/admin/labels";
import type { HealthItem } from "@/lib/admin/types";

export function SystemStatus({ items }: { items: HealthItem[] }) {
  const bad = items.filter((i) => !i.ok).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>
          {bad === 0 ? "Everything is running." : `${bad} ${bad === 1 ? "part needs" : "parts need"} attention.`}
        </CardDescription>
        <CardAction>
          <StatusIcon ok={bad === 0} className="size-5" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((h) => {
            const fix = HEALTH_FIX[h.key];
            return (
              <li key={h.key} className="flex items-center gap-3 py-2.5">
                <StatusIcon ok={h.ok} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{h.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{h.detail}</p>
                </div>
                {!h.ok && fix ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={fix.href}>
                      Fix <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
