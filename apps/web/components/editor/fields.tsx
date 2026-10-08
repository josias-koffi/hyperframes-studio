"use client";

import { isWordSplit, type PatchOperation } from "@studio/shared/browser";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A labelled row of the properties panel. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b px-3 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Edits a value locally and commits it on Enter or when the field is left: one edit, one undo step. */
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // A new value from the source (an undo, Claude) replaces the draft, during render rather than in an effect.
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft] as const;
}

export function TextInput({ value, onCommit, placeholder, disabled }: { value: string; onCommit: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useDraft(value);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <Input
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function TextArea({ value, onCommit, disabled }: { value: string; onCommit: (value: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <Textarea
      value={draft}
      disabled={disabled}
      className="min-h-20 resize-y text-sm"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) (event.target as HTMLTextAreaElement).blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** Which piece of a text a field edits: one of its pieces, all its words, or the whole (an element without text). */
export type TextPiece = number | "words" | null;

/**
 * The text of a layer: one field per piece when parts of it are styled apart (`<b>1/4</b> Brief`), so each keeps
 * its style; one field for a text split word by word.
 */
export function TextPieces({ runs, onCommit, disabled }: { runs: string[]; onCommit: (value: string, piece: TextPiece) => void; disabled?: boolean }) {
  if (runs.length === 0) return <TextArea value="" onCommit={(value) => onCommit(value, null)} disabled={disabled} />;
  if (isWordSplit(runs)) return <TextArea value={runs.join(" ")} onCommit={(value) => onCommit(value, "words")} disabled={disabled} />;
  return (
    <div className="space-y-1.5">
      {runs.map((run, index) => (
        <TextArea key={index} value={run} onCommit={(value) => onCommit(value, index)} disabled={disabled} />
      ))}
    </div>
  );
}

/** The patch operation of a text field. */
export function textOperation(value: string, piece: TextPiece): PatchOperation {
  if (piece === "words") return { type: "text-words", value };
  return piece === null ? { type: "text-content", value } : { type: "text-run", index: piece, value };
}

export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  disabled,
}: {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  const shown = String(Math.round(value * 1000) / 1000);
  const [draft, setDraft] = useDraft(shown);
  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(parsed)) return setDraft(shown);
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (Math.abs(clamped - value) > 1e-6) onCommit(clamped);
    else setDraft(shown);
  };
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        step={step}
        className={cn("tabular-nums", suffix && "pr-8")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = (Number.parseFloat(draft.replace(",", ".")) || 0) + (event.key === "ArrowUp" ? step : -step) * (event.shiftKey ? 10 : 1);
            setDraft(String(Math.round(next * 1000) / 1000));
          }
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** Colour swatch plus hex field. */
export function ColorInput({ value, onCommit, disabled }: { value: string; onCommit: (value: string) => void; disabled?: boolean }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        disabled={disabled}
        aria-label="Couleur"
        className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        onChange={(event) => onCommit(event.target.value)}
      />
      <TextInput value={value} onCommit={onCommit} disabled={disabled} placeholder="#000000" />
    </div>
  );
}

/** Range slider committing when released. */
export function SliderInput({ value, onCommit, min = 0, max = 1, step = 0.01, format }: { value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number; format?: (value: number) => string }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        className="h-1.5 flex-1 cursor-pointer accent-primary"
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => draft !== value && onCommit(draft)}
        onKeyUp={() => draft !== value && onCommit(draft)}
      />
      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{format ? format(draft) : draft}</span>
    </div>
  );
}

/** rgb()/rgba() of computed styles to #rrggbb, for the colour fields. */
export function toHex(color: string | null | undefined): string {
  if (!color) return "";
  if (color.startsWith("#")) return color;
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!match) return color;
  return `#${match
    .slice(1, 4)
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
}
