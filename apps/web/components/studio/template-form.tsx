"use client";

import type { CompositionVariable } from "@studio/shared/browser";
import { FilmIcon, ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { clientApi, type Template } from "@/lib/api";

type Values = Record<string, string | number | boolean>;

function VariableInput({ variable, value, onChange }: { variable: CompositionVariable; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `var-${variable.id}`;
  switch (variable.type) {
    case "number":
      return <Input id={id} type="number" min={variable.min} max={variable.max} step={variable.step} value={Number(value)} onChange={(e) => onChange(e.target.valueAsNumber)} />;
    case "color":
      return (
        <div className="flex items-center gap-2">
          <Input id={id} type="color" className="h-9 w-14 p-1" value={String(value)} onChange={(e) => onChange(e.target.value)} />
          <span className="font-mono text-xs text-muted-foreground uppercase">{String(value)}</span>
        </div>
      );
    case "boolean":
      return <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />;
    case "enum":
      return (
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variable.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return <Input id={id} maxLength={variable.maxLength} placeholder={variable.placeholder} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Form generated from the composition's `data-composition-variables`: filling it renders without Claude. */
export function TemplateForm({ template, disabled }: { template: Template; disabled?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => Object.fromEntries(template.variables.map((v) => [v.id, v.default])));
  const [pending, setPending] = useState(false);

  async function render(format: "mp4" | "png") {
    setPending(true);
    try {
      await clientApi(`/templates/${template.id}/render`, { method: "POST", body: JSON.stringify({ format, variables: values, ...(format === "png" && { frames: 1 }) }) });
      toast.success("Rendu lancé");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        {template.variables.map((variable) => (
          <Field key={variable.id} orientation={variable.type === "boolean" ? "horizontal" : "vertical"}>
            <FieldLabel htmlFor={`var-${variable.id}`}>{variable.label}</FieldLabel>
            <VariableInput variable={variable} value={values[variable.id]} onChange={(v) => setValues((current) => ({ ...current, [variable.id]: v }))} />
          </Field>
        ))}
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || disabled} onClick={() => render("mp4")}>
          <FilmIcon />
          Générer la vidéo
        </Button>
        <Button variant="outline" disabled={pending || disabled} onClick={() => render("png")}>
          <ImageIcon />
          Générer une image
        </Button>
      </div>
    </div>
  );
}
