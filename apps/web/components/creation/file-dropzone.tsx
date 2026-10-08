"use client";

import { CloudUploadIcon, FileIcon, FileTextIcon, ImageIcon, MusicIcon, RefreshCwIcon, TypeIcon, VideoIcon, XIcon, type LucideIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { AssetKind } from "@/lib/api";
import { formatBytes, kindFromFile } from "@/lib/assets";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  logo: ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
  font: TypeIcon,
  document: FileTextIcon,
  other: FileIcon,
};

/**
 * Points a media element at a local file: the object URL lives as long as the element and is revoked with it.
 * Set on the element rather than held in state, so strict mode's second mount gets a fresh URL.
 */
export function useObjectUrlRef(file: File) {
  return useCallback(
    (element: HTMLImageElement | HTMLMediaElement | null) => {
      if (!element) return;
      const url = URL.createObjectURL(file);
      element.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
}

/** Whether a file matches an `accept` list such as `video/*` or `image/*,.svg`. */
function accepts(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(",").some((rule) => {
    const pattern = rule.trim().toLowerCase();
    if (pattern.startsWith(".")) return file.name.toLowerCase().endsWith(pattern);
    if (pattern.endsWith("/*")) return file.type.startsWith(pattern.slice(0, -1));
    return file.type === pattern;
  });
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A local file as it will look once sent: the picture, the first frame of the video, or an icon. */
export function FileThumb({ file, className }: { file: File; className?: string }) {
  const kind = kindFromFile(file);
  const ref = useObjectUrlRef(file);
  if (kind === "image" || kind === "logo") {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    return <img ref={ref} alt={file.name} className={cn("size-full object-cover", className)} />;
  }
  if (kind === "video") return <video ref={ref} preload="metadata" muted className={cn("size-full bg-black object-cover", className)} />;
  const Icon = KIND_ICON[kind];
  return (
    <div className={cn("flex size-full items-center justify-center bg-muted", className)}>
      <Icon className="size-6 text-muted-foreground" />
    </div>
  );
}

/** The single file a start point needs, shown large: a player to check it is the right one. */
function SinglePreview({ file, onReplace, onRemove }: { file: File; onReplace: () => void; onRemove: () => void }) {
  const kind = kindFromFile(file);
  const ref = useObjectUrlRef(file);
  const [duration, setDuration] = useState<number | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-surface">
      {kind === "video" ? (
        <video ref={ref} controls preload="metadata" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} className="max-h-80 w-full bg-black" />
      ) : kind === "audio" ? (
        <div className="flex items-center gap-4 bg-gradient-to-br from-primary/15 to-primary/5 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MusicIcon className="size-5" />
          </span>
          <audio ref={ref} controls preload="metadata" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} className="h-10 min-w-0 flex-1" />
        </div>
      ) : (
        <div className="aspect-video">
          <FileThumb file={file} className="object-contain" />
        </div>
      )}
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatBytes(file.size)}
            {duration !== null && Number.isFinite(duration) && ` · ${formatDuration(duration)}`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReplace}>
          <RefreshCwIcon />
          Remplacer
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onRemove}>
          <XIcon />
          <span className="sr-only">Retirer {file.name}</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Drop or pick files kept in the browser until the création exists, each with a preview.
 * A single file is shown as a player; several as a grid of thumbnails, the zone staying open to add more.
 */
export function FileDropzone({
  label,
  accept,
  multiple,
  files,
  onChange,
  description,
  hint,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  description: string;
  /** Under the call to action, what the zone takes. */
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function add(list: FileList | null) {
    if (!list) return;
    const all = Array.from(list);
    const kept = all.filter((file) => accepts(file, accept));
    if (kept.length < all.length) toast.error(`${all.length - kept.length} fichier${all.length - kept.length > 1 ? "s" : ""} ignoré${all.length - kept.length > 1 ? "s" : ""} : format non pris en charge ici.`);
    if (!kept.length) return;
    onChange(multiple ? [...files, ...kept] : kept.slice(0, 1));
  }

  const single = !multiple && files.length === 1;
  const compact = multiple && files.length > 0;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-3">
        {single ? (
          <SinglePreview file={files[0]} onReplace={() => input.current?.click()} onRemove={() => onChange([])} />
        ) : (
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
              add(e.dataTransfer.files);
            }}
            className={cn(
              "flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card text-center transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              compact ? "px-4 py-3" : "flex-col px-6 py-8",
              over && "border-primary bg-accent",
            )}
          >
            <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", compact ? "size-8" : "size-11")}>
              <CloudUploadIcon className={compact ? "size-4" : "size-5"} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{compact ? "Ajouter d'autres fichiers" : "Glisse un fichier ici, ou clique pour parcourir"}</span>
              {!compact && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </span>
          </button>
        )}
        {multiple && files.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-lg border bg-card shadow-surface">
                <div className="aspect-square">
                  <FileThumb file={file} />
                </div>
                <div className="border-t px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-1.5 right-1.5 size-7 opacity-0 shadow-surface transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                >
                  <XIcon />
                  <span className="sr-only">Retirer {file.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
