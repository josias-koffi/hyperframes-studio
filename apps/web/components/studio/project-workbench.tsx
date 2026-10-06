"use client";

import { CHECKPOINT_STEPS, GENERATION_STEPS } from "@studio/shared/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type Job, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { JobLog } from "./job-log";
import { STATUS_LABELS, STEP_LABELS } from "./labels";

/**
 * What each step leaves to review. The composition itself cannot be framed: index.html needs the HyperFrames
 * runtime that `preview` and `render` inject, so the build is reviewed on its snapshot contact sheet.
 */
const PREVIEWS: Partial<Record<string, { label: string; file: string; image?: boolean }>> = {
  brief: { label: "BRIEF.md", file: "BRIEF.md" },
  storyboard: { label: "Storyboard", file: "storyboard.html" },
  build: { label: "Snapshots de la composition", file: "snapshots/contact-sheet.jpg", image: true },
};

export function ProjectWorkbench({ project, jobs }: { project: Project; jobs: Job[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lastClaude = jobs.find((job) => job.kind === "claude") ?? null;
  const active = lastClaude && ["queued", "running"].includes(lastClaude.status);
  const reviewing = lastClaude?.status === "waiting_review";
  const preview = lastClaude?.step ? PREVIEWS[lastClaude.step] : undefined;
  // The build checkpoint approved = the video is generated; only renders remain.
  const done = lastClaude?.step === "build" && lastClaude.status === "succeeded";

  async function act(path: string, body?: unknown) {
    setPending(true);
    try {
      await clientApi(`/projects/${project.id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setFeedback("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {GENERATION_STEPS.map((step) => (
          <li key={step}>
            <Badge variant={step === project.currentStep ? "default" : "outline"} className={cn(CHECKPOINT_STEPS.includes(step) && "gap-1")}>
              {STEP_LABELS[step]}
              {CHECKPOINT_STEPS.includes(step) && <span aria-label="validation">✓</span>}
            </Badge>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">
            {lastClaude?.step ? STEP_LABELS[lastClaude.step] : "Génération"}
            {lastClaude && <Badge variant="secondary" className="ml-2">{STATUS_LABELS[lastClaude.status]}</Badge>}
          </CardTitle>
          {!active && !reviewing && !done && (
            <Button onClick={() => act("generate")} disabled={pending}>
              {lastClaude?.status === "failed" ? "Relancer l'étape" : `Lancer : ${STEP_LABELS[project.currentStep]}`}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {done && <p className="text-sm text-muted-foreground">Vidéo générée : le rendu MP4 part automatiquement, suis-le dans Exports.</p>}
          {lastClaude ? (
            <JobLog key={lastClaude.id} jobId={lastClaude.id} onSettled={() => router.refresh()} />
          ) : (
            <p className="text-sm text-muted-foreground">Lance le brief : Claude écrit BRIEF.md puis enchaîne sur le storyboard.</p>
          )}
          {reviewing && (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Relis le résultat, puis valide ou demande des changements.</p>
              <Textarea placeholder="Ex. : raccourcir la frame 2, ton plus direct…" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
              <div className="flex gap-2">
                <Button onClick={() => act("approve")} disabled={pending}>
                  Valider et continuer
                </Button>
                <Button variant="outline" onClick={() => act("feedback", { text: feedback })} disabled={pending || !feedback.trim()}>
                  Envoyer le retour
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && lastClaude?.status !== "running" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{preview.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {preview.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace file served by the API, not an optimizable asset
              <img
                alt={preview.label}
                src={`/api/projects/${project.id}/files/${preview.file}?v=${lastClaude?.id}`}
                className="mx-auto max-h-[36rem] rounded-md border"
              />
            ) : (
              <iframe
                title={preview.label}
                src={`/api/projects/${project.id}/files/${preview.file}`}
                className="h-[36rem] w-full rounded-md border bg-white"
                sandbox="allow-scripts"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
