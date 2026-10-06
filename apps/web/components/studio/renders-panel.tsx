"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clientApi, type Job, type Render } from "@/lib/api";
import { JobLog } from "./job-log";
import { STATUS_LABELS } from "./labels";

export function RendersPanel({ projectId, renders, lastRenderJob }: { projectId: string; renders: Render[]; lastRenderJob: Job | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // A finished render shows up in the list below; a running or failed one only exists as a job.
  const shownJob = lastRenderJob && lastRenderJob.status !== "succeeded" ? lastRenderJob : null;
  const rendering = shownJob?.status === "queued" || shownJob?.status === "running";

  async function render(body: unknown) {
    setPending(true);
    try {
      await clientApi(`/projects/${projectId}/renders`, { method: "POST", body: JSON.stringify(body) });
      toast.success("Rendu lancé");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Exports</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || rendering} onClick={() => render({ format: "png", frames: 3 })}>
            Images de post
          </Button>
          <Button size="sm" disabled={pending || rendering} onClick={() => render({ format: "mp4" })}>
            Rendu MP4
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {shownJob && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Dernier rendu <Badge variant={shownJob.status === "failed" ? "destructive" : "secondary"}>{STATUS_LABELS[shownJob.status]}</Badge>
            </p>
            <JobLog key={shownJob.id} jobId={shownJob.id} onSettled={() => router.refresh()} />
          </div>
        )}
        {renders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun export.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {renders.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs uppercase">{r.format}</span>
                <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString("fr-FR")}</span>
                {r.urls.map((url, i) => (
                  <a key={url} href={url} className="underline" target="_blank" rel="noreferrer">
                    fichier {i + 1}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
