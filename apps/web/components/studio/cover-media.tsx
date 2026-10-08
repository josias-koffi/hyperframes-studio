"use client";

import { PlayIcon } from "lucide-react";
import type { Cover } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A card's cover: the still as is, or the video render on its first frame, played muted while hovered.
 * `#t=` makes browsers paint a frame without loading the whole file.
 */
export function CoverMedia({ cover, className }: { cover: Cover; className?: string }) {
  if (cover.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- render served from storage
    return <img src={cover.url} alt="" className={cn("size-full object-cover", className)} />;
  }
  return (
    <span className={cn("group/cover relative block size-full", className)}>
      <video
        src={`${cover.url}#t=0.5`}
        muted
        loop
        playsInline
        preload="metadata"
        className="size-full bg-black object-cover"
        onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = 0.5;
        }}
      />
      <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-opacity group-hover/cover:opacity-0">
        <PlayIcon className="size-2.5 fill-current" />
      </span>
    </span>
  );
}
