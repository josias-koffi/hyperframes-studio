"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function StudioError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Empty className="mx-4 w-auto rise-in border bg-card shadow-surface lg:mx-6">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Le studio ne répond pas</EmptyTitle>
        <EmptyDescription>
          L&apos;API est injoignable ou a renvoyé une erreur. Vérifie qu&apos;elle tourne, puis réessaie.
        </EmptyDescription>
        <p className="font-mono text-xs text-muted-foreground">{error.message}</p>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => retry()}>
          <RotateCcwIcon />
          Réessayer
        </Button>
      </EmptyContent>
    </Empty>
  );
}
