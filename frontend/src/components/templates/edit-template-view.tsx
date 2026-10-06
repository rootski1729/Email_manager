"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { templateQuery } from "@/lib/api/queries";
import { TemplateEditor } from "./template-editor";

export function EditTemplateView({ id }: { id: string }) {
  const t = useQuery(templateQuery(id));
  if (t.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
          <Skeleton className="h-[560px] rounded-xl" />
          <Skeleton className="h-[480px] rounded-xl" />
        </div>
      </div>
    );
  }
  if (t.isError) {
    const status = t.error instanceof ApiError ? t.error.status : 0;
    if (status === 404 || status === 422) {
      return (
        <EmptyState icon={SearchX} title="Template not found" description="It may have been deleted.">
          <Button asChild variant="outline">
            <Link href="/templates">Back to templates</Link>
          </Button>
        </EmptyState>
      );
    }
    return <ErrorState error={t.error} onRetry={() => void t.refetch()} />;
  }
  return <TemplateEditor key={t.data.id} template={t.data} />;
}
