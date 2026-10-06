"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { rulePacksQuery, useInstallPack } from "@/lib/api/packs";

const EXAMS_PACK = "exams";

export function UpcomingEmpty({ onAdd }: { onAdd: () => void }) {
  const packs = useQuery(rulePacksQuery);
  const install = useInstallPack();
  const exams = packs.data?.find((p) => p.id === EXAMS_PACK);

  return (
    <EmptyState
      icon={CalendarClock}
      title="Nothing coming up yet"
      description={
        <>
          When an important email mentions a date, like an exam on 12 Oct at 10 AM, an interview slot or a last date
          to pay, it shows up here automatically and you get WhatsApp reminders before it. Calendar invites are added
          as they are.
        </>
      }
    >
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        {exams && !exams.installed ? (
          <Button
            disabled={install.isPending}
            onClick={() =>
              install.mutate(
                { id: EXAMS_PACK },
                {
                  onSuccess: () =>
                    toast.success(`“${exams.name}” rule added`, {
                      description: "Exam dates in new mail will appear here.",
                    }),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {install.isPending ? <Spinner /> : <GraduationCap />} Watch for exam emails
          </Button>
        ) : exams?.installed ? (
          <Button asChild variant="outline">
            <Link href="/rules">
              <Check /> Exams pack installed · more packs
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/rules">Browse starter packs</Link>
          </Button>
        )}
        <Button variant="ghost" onClick={onAdd}>
          <Plus /> Add a date yourself
        </Button>
      </div>
    </EmptyState>
  );
}
