"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { engineUrl } from "./engine";

type PreviewMessage = { source?: string; type?: string; currentTime?: number; isPlaying?: boolean };

/**
 * The composition playing in the engine's runtime, scaled to fit its box. Edits are replayed in its page; when it
 * has to reload (`previewKey`), the page on screen stays until the new one is ready, and the new one comes back to
 * where it was. `holdAt` pins it to one time (a slide, an image).
 */
export function Preview({
  width,
  height,
  holdAt,
  className,
  children,
  onScale,
}: {
  width: number;
  height: number;
  holdAt?: number;
  className?: string;
  /** Drawn over the composition, in screen pixels (the canvas editor's selection). */
  children?: React.ReactNode;
  onScale?: (scale: number) => void;
}) {
  const { creation, previewKey, registerPreview, setPlayback, control, playback, setPreviewReady } = useEditor();
  const box = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const [scale, setScale] = useState(0);
  // The pages mounted: the one on screen (`shown`) and, while it loads, the next one.
  const [keys, setKeys] = useState<number[]>([previewKey]);
  const [shown, setShown] = useState<number | null>(null);
  const resumeAt = useRef(0);
  const hold = useRef(holdAt);

  if (!keys.includes(previewKey)) setKeys([...keys, previewKey]);

  useEffect(() => {
    resumeAt.current = playback.time;
  }, [playback.time]);

  useEffect(() => {
    hold.current = holdAt;
    if (shown !== null) registerPreview(frames.current.get(shown) ?? null, holdAt);
    if (holdAt !== undefined) control("seek", { timeSeconds: holdAt });
  }, [holdAt, control, registerPreview, shown]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: boxWidth, height: boxHeight } = entry.contentRect;
      const next = Math.max(0.05, Math.min(boxWidth / width, boxHeight / height));
      setScale(next);
      onScale?.(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height, onScale]);

  useEffect(() => {
    function onMessage(event: MessageEvent<PreviewMessage>) {
      if (event.data?.source !== "hf-preview") return;
      const key = [...frames.current].find(([, frame]) => frame.contentWindow === event.source)?.[0];
      if (key === undefined) return;
      if (event.data.type === "ready") {
        registerPreview(frames.current.get(key) ?? null, hold.current);
        control("pause");
        control("seek", { timeSeconds: hold.current ?? resumeAt.current });
        setShown(key);
        setKeys((current) => current.filter((candidate) => candidate >= key));
        setPreviewReady(true);
      }
      if (event.data.type === "state" && key === shown && hold.current === undefined) {
        setPlayback({ time: event.data.currentTime ?? 0, playing: Boolean(event.data.isPlaying) });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [control, registerPreview, setPlayback, setPreviewReady, shown]);

  return (
    <div ref={box} className={cn("relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden", className)}>
      {scale > 0 && (
        <div className="relative shrink-0 overflow-hidden rounded-sm shadow-raised" style={{ width: width * scale, height: height * scale }}>
          {keys.map((key) => (
            <iframe
              key={key}
              ref={(element) => {
                if (element) frames.current.set(key, element);
                else frames.current.delete(key);
              }}
              title="Aperçu"
              src={`${engineUrl(creation.id, "preview")}?v=${key}`}
              className={cn("absolute top-0 left-0 origin-top-left border-0 bg-white", key !== shown && "invisible")}
              style={{ width, height, transform: `scale(${scale})` }}
              // The overlay of the canvas editor takes the pointer; the video editor lets nothing through either.
              tabIndex={-1}
            />
          ))}
          <div className="absolute inset-0">{children}</div>
          {shown === null && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <Spinner className="size-6" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
