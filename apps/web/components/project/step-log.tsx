"use client";

import { BotIcon, ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { JobLog } from "@/components/studio/job-log";
import { StatusBadge } from "@/components/studio/status-badge";
import type { Job } from "@/lib/api";
import { formatRelative } from "@/lib/format";

/** Claude's log for a step, folded unless it is live: the result matters more than the transcript. */
export function StepLog({ job }: { job: Job }) {
  const router = useRouter();
  const live = job.status === "queued" || job.status === "running";
  return (
    <details className="group rounded-xl border bg-card shadow-surface" open={live}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm select-none [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <BotIcon className="size-4 text-primary" />
        <span className="font-medium">Journal de Claude</span>
        <StatusBadge status={job.status} />
        <span className="ml-auto text-xs text-muted-foreground">{formatRelative(job.createdAt)}</span>
      </summary>
      <div className="border-t p-3">
        <JobLog jobId={job.id} onSettled={() => router.refresh()} className="max-h-[32rem]" />
      </div>
    </details>
  );
}
