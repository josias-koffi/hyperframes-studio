"use client";

import type { JobStatus, StudioEvent } from "@studio/shared/browser";
import { useEffect, useRef, useState } from "react";
import type { JobStreamMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const integer = new Intl.NumberFormat("fr-FR");

/** Turns, duration, tokens and API-equivalent cost of one Claude turn. */
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
  if (event.costUsd !== undefined) parts.push(`≈ ${event.costUsd.toFixed(2)} $ (prix API)`);
  return parts.length > 0 ? <p className="font-mono text-xs text-muted-foreground">{parts.join(" · ")}</p> : null;
}

function EventLine({ event }: { event: StudioEvent }) {
  switch (event.kind) {
    case "text":
      return <p className="whitespace-pre-wrap">{event.text}</p>;
    case "tool":
      return (
        <p className="font-mono text-xs text-muted-foreground">
          → {event.name} <span className="opacity-70">{event.summary}</span>
        </p>
      );
    case "tool_result":
      return event.isError ? <p className="font-mono text-xs text-destructive">✗ {event.summary}</p> : null;
    case "result":
      return (
        <div className="space-y-1">
          {/* `result` repeats Claude's last message, already shown as a text event. */}
          <p className={cn("font-medium", event.ok ? "text-emerald-600" : "text-destructive")}>{event.ok ? "Terminé" : "Échec"}</p>
          <ResultStats event={event} />
        </div>
      );
    case "log":
      return <p className={cn("font-mono text-xs", event.level === "error" && "text-destructive")}>{event.text}</p>;
    case "session":
      return <p className="font-mono text-xs text-muted-foreground">session {event.sessionId}</p>;
  }
}

/** Live log of one job: replays the stored events, then follows the SSE feed until the job settles. */
export function JobLog({ jobId, onSettled }: { jobId: string; onSettled?: (status: JobStatus) => void }) {
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
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
        settled.current?.(data.status);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  const lastResult = events.findLastIndex((event) => event.kind === "result");

  return (
    <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm">
      {events.length === 0 && <p className="text-muted-foreground">En attente des premiers événements…</p>}
      {events.map((event, index) =>
        // Background agents make Claude print one result per finished agent: only the last one is the step's.
        event.kind === "result" && index !== lastResult ? null : <EventLine key={index} event={event} />,
      )}
      <div ref={bottom} />
    </div>
  );
}
