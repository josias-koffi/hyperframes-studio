"use client";

import { useState } from "react";
import { formatUsd } from "@/components/ai/labels";
import type { AiUsage } from "@/lib/api";

type Day = { day: string; costUsd: number; subscriptionUsd: number; jobs: number };

/** Every day of the period, the ones without generation at zero, so the bars keep a regular rhythm. */
export function fillDays(byDay: AiUsage["byDay"], days: number, end = new Date()): Day[] {
  const found = new Map(byDay.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    const day = date.toISOString().slice(0, 10);
    return found.get(day) ?? { day, costUsd: 0, subscriptionUsd: 0, jobs: 0 };
  });
}

/** Clean tick values from zero to a rounded maximum. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return [0, step, step * 2, step * 3];
}

const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** OpenRouter cost per day: one series, so no legend; hover or focus a day for its detail. */
export function CostChart({ byDay, days }: { byDay: AiUsage["byDay"]; days: number }) {
  const data = fillDays(byDay, days);
  const [active, setActive] = useState<number | null>(null);
  const scale = ticks(Math.max(...data.map((row) => row.costUsd)));
  const top = scale.at(-1) || 1;
  const shown = active === null ? null : data[active];
  const labelEvery = Math.ceil(days / 8);

  return (
    <figure className="space-y-3">
      <div className="relative flex h-56 gap-2">
        <div className="relative w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums" aria-hidden>
          {scale.map((tick) => (
            <span key={tick} className="absolute right-0" style={{ bottom: `${(tick / top) * 100}%`, transform: "translateY(50%)" }}>
              {formatUsd(tick)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" onMouseLeave={() => setActive(null)}>
          {scale.map((tick) => (
            <span key={tick} aria-hidden className="absolute inset-x-0 h-px bg-border" style={{ bottom: `${(tick / top) * 100}%` }} />
          ))}
          <ol className="absolute inset-0 flex items-end gap-0.5" aria-label="Coût OpenRouter par jour">
            {data.map((row, index) => (
              <li key={row.day} className="flex h-full flex-1 items-end justify-center">
                <button
                  type="button"
                  className="group flex h-full w-full items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`${dayLabel(row.day, { day: "numeric", month: "long" })} : ${formatUsd(row.costUsd)}, ${row.jobs} génération${row.jobs > 1 ? "s" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <span
                    className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                    style={{ height: row.costUsd > 0 ? `max(${(row.costUsd / top) * 100}%, 2px)` : 0 }}
                  />
                </button>
              </li>
            ))}
          </ol>
          {shown && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-xs shadow-raised"
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
            >
              <p className="font-medium">{dayLabel(shown.day, { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="tabular-nums">{formatUsd(shown.costUsd)} OpenRouter</p>
              <p className="text-muted-foreground tabular-nums">
                {shown.jobs} génération{shown.jobs > 1 ? "s" : ""}
                {shown.subscriptionUsd > 0 && ` · ${formatUsd(shown.subscriptionUsd)} Claude Code`}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="ml-14 flex justify-between text-xs text-muted-foreground" aria-hidden>
        {data.map((row, index) => (index % labelEvery === 0 ? <span key={row.day}>{dayLabel(row.day, { day: "numeric", month: "short" })}</span> : null))}
      </div>
    </figure>
  );
}
