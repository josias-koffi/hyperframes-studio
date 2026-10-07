"use client";

import { ExternalLinkIcon, PencilRulerIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { clientApi } from "@/lib/api";

type FrameState = { status: "opening" } | { status: "open"; url: string } | { status: "failed"; message: string };

/** Asks the API to open the project's Studio in the hf-studio gateway, in the app's current theme. */
async function openStudio(projectId: string): Promise<FrameState> {
  try {
    const { url } = await clientApi<{ url: string }>(`/projects/${projectId}/studio`, { method: "POST" });
    const studio = new URL(url);
    studio.searchParams.set("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
    return { status: "open", url: studio.href };
  } catch (error) {
    return { status: "failed", message: (error as Error).message };
  }
}

/** The Studio HyperFrames editor of this project, framed in the page. */
export function StudioFrame({ projectId, blockedReason }: { projectId: string; blockedReason: string | null }) {
  const [state, setState] = useState<FrameState>({ status: "opening" });
  const frame = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (blockedReason) return;
    let current = true;
    void openStudio(projectId).then((next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [blockedReason, projectId]);

  // Theme switches reach the framed Studio without reloading it (public/overrides.js in hf-studio).
  const studioOrigin = state.status === "open" ? new URL(state.url).origin : null;
  useEffect(() => {
    if (!studioOrigin || !resolvedTheme) return;
    frame.current?.contentWindow?.postMessage({ type: "framesmith:theme", theme: resolvedTheme }, studioOrigin);
  }, [resolvedTheme, studioOrigin]);

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
        ref={frame}
        src={state.url}
        title="Studio HyperFrames"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
        className="h-[calc(100svh-var(--header-height)-13rem)] min-h-[32rem] w-full rounded-lg border bg-background shadow-surface"
      />
    </div>
  );
}
