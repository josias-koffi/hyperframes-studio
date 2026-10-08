"use client";

import type { CompositionVariable } from "@studio/shared/browser";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type VariableValue = string | number | boolean;

/** The input matching a variable's type: what an iteration fills and what a default is edited with. */
export function VariableInput({
  variable,
  value,
  onChange,
  id = `var-${variable.id}`,
  disabled,
}: {
  variable: CompositionVariable;
  value: unknown;
  onChange: (value: VariableValue) => void;
  id?: string;
  disabled?: boolean;
}) {
  switch (variable.type) {
    case "number":
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            min={variable.min}
            max={variable.max}
            step={variable.step}
            value={Number.isFinite(value) ? Number(value) : ""}
            onChange={(e) => onChange(e.target.valueAsNumber)}
            disabled={disabled}
          />
          {variable.unit && <span className="text-sm text-muted-foreground">{variable.unit}</span>}
        </div>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <Input id={id} type="color" className="h-8 w-12 shrink-0 p-1" value={String(value ?? "#000000")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
          <Input aria-label={`${variable.label} (hexadécimal)`} className="font-mono uppercase" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        </div>
      );
    case "boolean":
      return <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} />;
    case "enum":
      return (
        <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
          <SelectContent>
            {variable.options
              .filter((option) => option.value !== "")
              .map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label || option.value}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      );
    default: {
      const text = String(value ?? "");
      return (
        <div className="relative">
          <Input
            id={id}
            maxLength={variable.maxLength}
            placeholder={variable.placeholder}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            className={cn(variable.maxLength && "pr-14")}
            disabled={disabled}
          />
          {variable.maxLength && (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
              {text.length}/{variable.maxLength}
            </span>
          )}
        </div>
      );
    }
  }
}

/** A short readable form of a value: colour swatch, yes/no, enum label, clipped text. */
export function ValueChip({ variable, value, className }: { variable?: CompositionVariable; value: unknown; className?: string }) {
  const base = "inline-flex max-w-48 items-center gap-1.5 rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs";
  if (variable?.type === "color" && typeof value === "string") {
    return (
      <span className={cn(base, "font-mono uppercase", className)}>
        <span className="size-3 shrink-0 rounded-sm border" style={{ background: value }} />
        {value}
      </span>
    );
  }
  if (typeof value === "boolean") return <span className={cn(base, className)}>{value ? "Oui" : "Non"}</span>;
  const label = variable?.type === "enum" ? (variable.options.find((option) => option.value === value)?.label ?? String(value)) : String(value ?? "—");
  return (
    <span className={cn(base, className)} title={label}>
      <span className="truncate">{label}</span>
    </span>
  );
}
