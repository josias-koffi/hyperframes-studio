"use client";

import { FileIcon, ImageIcon, MusicIcon, PlusIcon, UploadIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientApi, type Asset, type AssetKind } from "@/lib/api";
import { kindFromFile, uploadAsset } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

/** What the file picker accepts for the kinds a panel shows. */
const ACCEPT: Partial<Record<AssetKind, string>> = { image: "image/*", logo: "image/*", video: "video/*", audio: "audio/*" };

const ICONS: Partial<Record<AssetKind, LucideIcon>> = { image: ImageIcon, logo: ImageIcon, video: VideoIcon, audio: MusicIcon };

export type ImportedAsset = { path: string; kind: AssetKind; contentType: string; filename: string };

/**
 * The campaign's media and the shared library. A click adds the media to the création: it is copied into its
 * folder first (`assets/uploads/`), then `onAdd` places it. A file uploaded from here joins the création's media
 * and is placed at once.
 */
export function MediaPanel({ kinds, onAdd }: { kinds: AssetKind[]; onAdd: (asset: ImportedAsset) => Promise<void> | void }) {
  const { creation, lock } = useEditor();
  const [groups, setGroups] = useState<{ title: string; assets: Asset[] }[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const accept = [...new Set(kinds.map((kind) => ACCEPT[kind]).filter(Boolean))].join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all([clientApi<Asset[]>(`/assets?creationId=${creation.id}`), clientApi<Asset[]>(`/assets`)])
      .then(([campaign, library]) => {
        if (cancelled) return;
        const keep = (list: Asset[]) => list.filter((asset) => kinds.includes(asset.kind));
        setGroups([
          { title: "Campagne", assets: keep(campaign) },
          { title: "Bibliothèque", assets: keep(library) },
        ]);
      })
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [creation.id, kinds, reload]);

  async function add(asset: Asset) {
    setAdding(asset.id);
    try {
      const imported = await clientApi<{ path: string }>(`/creations/${creation.id}/editor/assets/${asset.id}`, { method: "POST" });
      await onAdd({ path: imported.path, kind: asset.kind, contentType: asset.contentType, filename: asset.filename });
    } finally {
      setAdding(null);
    }
  }

  async function upload(file: File) {
    if (!kinds.includes(kindFromFile(file))) return toast.error(`${file.name} : ce type de fichier ne va pas ici.`);
    setAdding("upload");
    try {
      const asset = await uploadAsset(file, { creationId: creation.id });
      setReload((value) => value + 1);
      await add(asset);
    } catch (error) {
      toast.error((error as Error).message);
      setAdding(null);
    }
  }

  if (!groups) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      <Button variant="outline" size="sm" className="w-full border-dashed" disabled={Boolean(lock) || adding !== null} onClick={() => input.current?.click()}>
        {adding === "upload" ? <Spinner /> : <UploadIcon />}
        Importer un fichier
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept || undefined}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {groups.map((group) => (
        <div key={group.title} className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h3>
          {group.assets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {group.title === "Campagne" ? "Aucun média : importe un fichier ou ajoute-en depuis les assets du projet." : "La bibliothèque est vide."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {group.assets.map((asset) => {
                const Icon = ICONS[asset.kind] ?? FileIcon;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={Boolean(lock) || adding !== null}
                    onClick={() => void add(asset)}
                    title={`Ajouter ${asset.filename}`}
                    className={cn(
                      "group relative flex aspect-square flex-col overflow-hidden rounded-md border bg-muted/40 text-left transition-colors hover:border-primary disabled:opacity-60",
                    )}
                  >
                    {asset.kind === "image" || asset.kind === "logo" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- presigned URL from the bucket
                      <img src={asset.url} alt="" className="min-h-0 flex-1 object-cover" />
                    ) : (
                      <span className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
                        <Icon className="size-6" />
                      </span>
                    )}
                    <span className="truncate border-t bg-background/90 px-1.5 py-1 text-[11px]">{asset.filename}</span>
                    <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {adding === asset.id ? <Spinner className="size-3" /> : <PlusIcon className="size-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
