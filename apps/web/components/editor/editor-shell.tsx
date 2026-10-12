"use client";

import { ArrowLeftIcon, CheckIcon, CircleAlertIcon, DownloadIcon, LoaderIcon, Redo2Icon, SparklesIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CREATION_TYPE_META } from "@/components/studio/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clientApi, type Creation } from "@/lib/api";
import { AssistantPanel } from "./assistant-panel";
import { CanvasEditor } from "./canvas/canvas-editor";
import { EditorProvider, useEditor } from "./editor-context";
import { VideoEditor } from "./video/video-editor";

type Opened = { creation: Creation; lockedBy: { jobId: string } | null };

/** Commits the manual edits of the session; sent even while the page goes away. */
function checkpoint(creationId: string) {
  void fetch(`/api/creations/${creationId}/editor/checkpoint`, { method: "POST", keepalive: true }).catch(() => null);
}

/** On leaving the page: the session's edits, if any, become a checkpoint. */
function CheckpointOnLeave() {
  const { creation, wrote } = useEditor();
  useEffect(() => {
    const leave = () => {
      if (wrote()) checkpoint(creation.id);
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [creation.id, wrote]);
  return null;
}

/**
 * Framesmith's editor of one création, full screen: the video editor (preview and timeline) or the canvas editor
 * (image, carousel), with undo, export and Claude at hand.
 */
export function EditorShell({ creationId, backHref }: { creationId: string; backHref: string }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opening = useRef<string | null>(null);

  useEffect(() => {
    // Opened once per création, even when React runs the effect twice.
    if (opening.current === creationId) return;
    opening.current = creationId;
    clientApi<Opened>(`/creations/${creationId}/editor/open`, { method: "POST" })
      .then(setOpened)
      .catch((failure: Error) => setError(failure.message));
  }, [creationId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {opened ? (
        <EditorProvider creation={opened.creation} initialLock={opened.lockedBy}>
          <CheckpointOnLeave />
          <TopBar backHref={backHref} />
          <div className="min-h-0 flex-1">{opened.creation.type === "video" ? <VideoEditor /> : <CanvasEditor />}</div>
        </EditorProvider>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>L&apos;éditeur ne s&apos;ouvre pas</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeftIcon />
                  Retour à la création
                </Link>
              </Button>
            </Empty>
          ) : (
            <Spinner className="size-6" />
          )}
        </div>
      )}
    </div>
  );
}

function TopBar({ backHref }: { backHref: string }) {
  const { creation, undo, redo, undoLabel, redoLabel, save, flush, wrote, lock } = useEditor();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const { label, icon: Icon } = CREATION_TYPE_META[creation.type];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  async function exportDeliverable() {
    setExporting(true);
    try {
      await flush();
      await clientApi(`/creations/${creation.id}/editor/checkpoint`, { method: "POST" });
      await clientApi(`/creations/${creation.id}/renders`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Export lancé", {
        description: "Le fichier apparaîtra dans les exports de la création.",
        action: { label: "Voir les exports", onClick: () => router.push(`${backHref}/exports`) },
      });
    } catch (failure) {
      toast.error((failure as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header data-window-header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      <Button variant="ghost" size="sm" asChild>
        <Link
          href={backHref}
          onClick={(event) => {
            // The edits are written first, then committed; the page goes once they are.
            event.preventDefault();
            void flush().then(() => {
              if (wrote()) checkpoint(creation.id);
              router.push(backHref);
            });
          }}
        >
          <ArrowLeftIcon />
          Retour
        </Link>
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium">{creation.name}</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {label}
        </Badge>
      </div>
      <div className="ml-2 flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={undo} disabled={!undoLabel || Boolean(lock)} aria-label="Annuler">
              <Undo2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{undoLabel ? `Annuler : ${undoLabel}` : "Rien à annuler"} (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={redo} disabled={!redoLabel || Boolean(lock)} aria-label="Rétablir">
              <Redo2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{redoLabel ? `Rétablir : ${redoLabel}` : "Rien à rétablir"} (Ctrl+Maj+Z)</TooltipContent>
        </Tooltip>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {lock ? (
          <>
            <SparklesIcon className="size-3.5 animate-pulse text-primary" /> Claude modifie la création…
          </>
        ) : save === "saving" ? (
          <>
            <LoaderIcon className="size-3.5 animate-spin" /> Enregistrement…
          </>
        ) : save === "error" ? (
          <>
            <CircleAlertIcon className="size-3.5 text-destructive" /> Non enregistré
          </>
        ) : (
          <>
            <CheckIcon className="size-3.5 text-success" /> Enregistré
          </>
        )}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={exportDeliverable} disabled={exporting || Boolean(lock)}>
          {exporting ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
          Exporter
        </Button>
      </div>
    </header>
  );
}

/** The right column of both editors: the selection's properties, or Claude. */
export function SidePanel({ properties, context }: { properties: React.ReactNode; context: string | null }) {
  const { lock } = useEditor();
  const [tab, setTab] = useState(lock ? "claude" : "properties");
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-0">
      <TabsList className="m-2 grid w-auto grid-cols-2">
        <TabsTrigger value="properties">Propriétés</TabsTrigger>
        <TabsTrigger value="claude">
          <SparklesIcon />
          Claude
        </TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="min-h-0 flex-1 overflow-y-auto">
        {properties}
      </TabsContent>
      <TabsContent value="claude" className="min-h-0 flex-1">
        <AssistantPanel context={context} />
      </TabsContent>
    </Tabs>
  );
}
