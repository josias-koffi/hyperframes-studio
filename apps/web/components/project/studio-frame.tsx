"use client";

import { ExternalLinkIcon, PencilRulerIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { clientApi } from "@/lib/api";

type FrameState = { status: "opening" } | { status: "open"; url: string } | { status: "failed"; message: string };

/** Asks the API to start the project's Studio in the hf-studio gateway: slow the first time. */
async function openStudio(projectId: string): Promise<FrameState> {
  try {
    const { url } = await clientApi<{ url: string }>(`/projects/${projectId}/studio`, { method: "POST" });
    return { status: "open", url };
  } catch (error) {
    return { status: "failed", message: (error as Error).message };
  }
}

/** The Studio HyperFrames editor of this project, framed in the page. */
export function StudioFrame({ projectId, blockedReason }: { projectId: string; blockedReason: string | null }) {
  const [state, setState] = useState<FrameState>({ status: "opening" });

  useEffect(() => {
    if (blockedReason) return;
    let current = true;
    void openStudio(projectId).then((next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [blockedReason, projectId]);

  if (blockedReason || state.status === "failed") {
    return (
      <Empty className="rise-in border bg-card shadow-surface">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Le Studio HyperFrames n&apos;est pas disponible</EmptyTitle>
          <EmptyDescription>{blockedReason ?? (state.status === "failed" ? state.message : null)}</EmptyDescription>
        </EmptyHeader>
        {!blockedReason && (
          <EmptyContent>
            <Button
              onClick={() => {
                setState({ status: "opening" });
                void openStudio(projectId).then(setState);
              }}
            >
              <RotateCcwIcon />
              Réessayer
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  if (state.status === "opening") {
    return (
      <Empty className="rise-in border bg-card shadow-surface">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PencilRulerIcon />
          </EmptyMedia>
          <EmptyTitle className="flex items-center gap-2">
            <Spinner />
            Ouverture du Studio…
          </EmptyTitle>
          <EmptyDescription>La première ouverture d&apos;un projet peut prendre quelques secondes.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>Tes modifications sont enregistrées dans le projet et seront dans le prochain rendu.</p>
        <Button variant="ghost" size="sm" asChild>
          <a href={state.url} target="_blank" rel="noopener noreferrer">
            Plein écran
            <ExternalLinkIcon className="opacity-60" />
          </a>
        </Button>
      </div>
      <iframe
        src={state.url}
        title="Studio HyperFrames"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
        className="h-[calc(100svh-var(--header-height)-13rem)] min-h-[32rem] w-full rounded-lg border bg-background shadow-surface"
      />
    </div>
  );
}
