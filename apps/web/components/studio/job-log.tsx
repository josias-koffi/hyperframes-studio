"use client";

import type { JobStatus, StudioEvent } from "@studio/shared/browser";
import { BotIcon, CheckCircle2Icon, ChevronRightIcon, CircleXIcon, WrenchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { JobStreamMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const integer = new Intl.NumberFormat("fr-FR");

/** Turns, duration, tokens and cost of one generation turn (API-equivalent on Claude Code). */
function ResultStats({ event }: { event: Extract<StudioEvent, { kind: "result" }> }) {
  const parts: string[] = [];
  if (event.numTurns !== undefined) parts.push(`${event.numTurns} tours`);
  if (event.durationMs !== undefined) parts.push(`${Math.round(event.durationMs / 1000)} s`);
  if (event.usage) {
    const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = event.usage;
    parts.push(
      `tokens : ${integer.format(inputTokens)} entrée · ${integer.format(outputTokens)} sortie · ${integer.format(cacheReadTokens)} cache lu · ${integer.format(cacheCreationTokens)} cache écrit`,
    );
  }
  if (event.costUsd !== undefined) parts.push(`≈ ${event.costUsd.toFixed(3)} $`);
  return parts.length > 0 ? <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{parts.join(" · ")}</p> : null;
}

type Tool = Extract<StudioEvent, { kind: "tool" | "tool_result" }>;

/** Consecutive tool calls fold into one line: what Claude says stays readable between them. */
type Block = { kind: "event"; event: StudioEvent } | { kind: "tools"; events: Tool[] };

function toBlocks(events: StudioEvent[]): Block[] {
  const lastResult = events.findLastIndex((event) => event.kind === "result");
  const blocks: Block[] = [];
  events.forEach((event, index) => {
    // Background agents make Claude print one result per finished agent: only the last one is the step's.
    if (event.kind === "result" && index !== lastResult) return;
    if (event.kind === "tool" || event.kind === "tool_result") {
      const previous = blocks.at(-1);
      if (previous?.kind === "tools") previous.events.push(event);
      else blocks.push({ kind: "tools", events: [event] });
      return;
    }
    blocks.push({ kind: "event", event });
  });
  return blocks;
}

function ToolGroup({ events, live }: { events: Tool[]; live: boolean }) {
  const calls = events.filter((event) => event.kind === "tool");
  const errors = events.filter((event) => event.kind === "tool_result" && event.isError).length;
  const last = calls.at(-1);
  return (
    <details className="group rounded-md border bg-card/60 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
        <WrenchIcon className="size-3.5" />
        <span>
          {calls.length} action{calls.length > 1 ? "s" : ""}
        </span>
        {errors > 0 && <span className="text-destructive">· {errors} en erreur</span>}
        {live && last?.kind === "tool" && (
          <span className="truncate font-mono opacity-80">
            · {last.name} {last.summary}
          </span>
        )}
      </summary>
      <div className="space-y-1 border-t px-2.5 py-2 font-mono">
        {events.map((event, index) =>
          event.kind === "tool" ? (
            <p key={index} className="break-all text-muted-foreground">
              → {event.name} <span className="opacity-70">{event.summary}</span>
            </p>
          ) : event.isError ? (
            <p key={index} className="break-all text-destructive">
              ✗ {event.summary}
            </p>
          ) : null,
        )}
      </div>
    </details>
  );
}

/** Claude writes Markdown: bold and inline code are enough to make it readable without a parser. */
function InlineMarkdown({ text }: { text: string }) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function EventLine({ event }: { event: StudioEvent }) {
  switch (event.kind) {
    case "text":
      return (
        <div className="flex gap-2">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BotIcon className="size-3.5" />
          </span>
          <p className="min-w-0 flex-1 rounded-lg rounded-tl-sm bg-card px-3 py-2 whitespace-pre-wrap shadow-surface">
            <InlineMarkdown text={event.text} />
          </p>
        </div>
      );
    case "result":
      return (
        // `result` repeats Claude's last message, already shown as a text event.
        <div className={cn("space-y-1 rounded-md border px-3 py-2", event.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
          <p className={cn("flex items-center gap-1.5 font-medium", event.ok ? "text-success" : "text-destructive")}>
            {event.ok ? <CheckCircle2Icon className="size-4" /> : <CircleXIcon className="size-4" />}
            {event.ok ? "Étape terminée" : "Échec"}
          </p>
          <ResultStats event={event} />
        </div>
      );
    case "log":
      return <p className={cn("font-mono text-xs text-muted-foreground", event.level === "error" && "text-destructive")}>{event.text}</p>;
    case "session":
      return (
        <p className="font-mono text-[11px] text-muted-foreground/70">
          {event.model ? `${event.model} · ` : ""}session {event.sessionId}
        </p>
      );
    default:
      return null;
  }
}

/** Live log of one job: replays the stored events, then follows the SSE feed until the job settles. */
export function JobLog({
  jobId,
  onSettled,
  className,
}: {
  jobId: string;
  onSettled?: (status: JobStatus) => void;
  className?: string;
}) {
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [live, setLive] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  });

  // The parent keys this component by job id, so a new job starts from an empty log.
  useEffect(() => {
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (message) => {
      const data = JSON.parse(message.data) as JobStreamMessage;
      if (data.event) setEvents((current) => [...current, data.event as StudioEvent]);
      if (data.status && data.status !== "running" && data.status !== "queued") {
        source.close();
        setLive(false);
        settled.current?.(data.status);
      }
    };
    source.onerror = () => {
      source.close();
      setLive(false);
    };
    return () => source.close();
  }, [jobId]);

  // Follow the tail inside the log only: scrolling the page would yank the user away from the preview.
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [events.length]);

  const blocks = toBlocks(events);

  return (
    <div ref={box} className={cn("space-y-3 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm", className)}>
      {events.length === 0 && (
        <p className="flex items-center gap-2 text-muted-foreground">
          {live && <span className="rec-dot" />}
          En attente des premiers événements…
        </p>
      )}
      {blocks.map((block, index) =>
        block.kind === "tools" ? (
          <ToolGroup key={index} events={block.events} live={live && index === blocks.length - 1} />
        ) : (
          <EventLine key={index} event={block.event} />
        ),
      )}
      {live && events.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rec-dot" /> L&apos;assistant travaille…
        </p>
      )}
    </div>
  );
}
