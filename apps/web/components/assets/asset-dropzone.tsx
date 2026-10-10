"use client";

import { CloudUploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import type { Asset } from "@/lib/api";
import { formatBytes, uploadAsset } from "@/lib/assets";
import { cn } from "@/lib/utils";

type Upload = { name: string; size: number; progress: number };

/** Drop or pick files: each is uploaded on its presigned URL, then the page reloads its list. */
export function AssetDropzone({
  projectId,
  creationId,
  accept,
  hint,
  onUploaded,
  compact,
}: {
  projectId?: string;
  /** Uploaded for one création only. */
  creationId?: string;
  accept?: string;
  hint?: string;
  /** Called per file once stored; without it the page is refreshed after the batch. */
  onUploaded?: (asset: Asset, file: File) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploads(list.map((file) => ({ name: file.name, size: file.size, progress: 0 })));
    let failed = 0;
    await Promise.all(
      list.map(async (file, index) => {
        try {
          const asset = await uploadAsset(file, {
            projectId,
            creationId,
            onProgress: (progress) => setUploads((current) => current.map((u, i) => (i === index ? { ...u, progress } : u))),
          });
          onUploaded?.(asset, file);
        } catch (error) {
          failed++;
          toast.error(`${file.name} : ${(error as Error).message}`);
        }
      }),
    );
    setUploads([]);
    if (failed < list.length) toast.success(`${list.length - failed} fichier${list.length - failed > 1 ? "s" : ""} ajouté${list.length - failed > 1 ? "s" : ""}`);
    if (!onUploaded) router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card text-center transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          compact ? "px-4 py-5" : "px-6 py-10",
          over && "border-primary bg-accent",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CloudUploadIcon className="size-5" />
        </span>
        <span className="text-sm font-medium">Glisse tes fichiers ici, ou clique pour parcourir</span>
        <span className="text-xs text-muted-foreground">{hint ?? "Images, logos, vidéos, sons, polices — jusqu'à 2 Go par fichier."}</span>
      </button>
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => e.target.files && void send(e.target.files)} />
      {uploads.map((upload) => (
        <div key={upload.name} className="space-y-1.5 rounded-lg border bg-card px-3 py-2">
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate font-medium">{upload.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatBytes(upload.size)} · {Math.round(upload.progress * 100)} %
            </span>
          </div>
          <Progress value={upload.progress * 100} />
        </div>
      ))}
    </div>
  );
}
