"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { ruleQuery } from "@/lib/api/queries";
import { RuleEditor } from "./rule-editor";

export function EditRuleView({ id }: { id: string }) {
  const rule = useQuery(ruleQuery(id));
  if (rule.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (rule.isError) {
    const status = rule.error instanceof ApiError ? rule.error.status : 0;
    if (status === 404 || status === 422) {
      return (
        <EmptyState icon={SearchX} title="Not found" description="It may have been deleted.">
          <Button asChild variant="outline">
            <Link href="/rules">Back to What to watch</Link>
          </Button>
        </EmptyState>
      );
    }
    return <ErrorState error={rule.error} onRetry={() => void rule.refetch()} />;
  }
  return <RuleEditor key={rule.data.id} rule={rule.data} />;
}
