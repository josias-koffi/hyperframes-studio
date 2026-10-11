import type { Metadata } from "next";
import { formatUsd, MODEL_SLOT_META } from "@/components/ai/labels";
import { CostChart } from "@/components/admin/cost-chart";
import { FilterTabs } from "@/components/layout/filter-tabs";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiUsage } from "@/lib/api";
import { param } from "@/lib/listing";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usage et coûts" };

const PERIODS = [7, 30, 90] as const;
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="gap-2 shadow-surface">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

export default async function AdminUsagePage({ searchParams }: PageProps<"/admin/usage">) {
  const requested = Number(param((await searchParams).days));
  const days = PERIODS.find((period) => period === requested) ?? 30;
  const usage = await serverApi<AiUsage>(`/admin/usage?days=${days}`);
  const { totals } = usage;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <FilterTabs
        label="Période"
        tabs={PERIODS.map((period) => ({ label: `${period} jours`, href: `/admin/usage?days=${period}`, active: period === days }))}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Coût OpenRouter" value={formatUsd(totals.costUsd)} hint="Facturé sur la clé de la plateforme." />
        <Stat label="Générations" value={compact.format(totals.jobs)} hint="Étapes et modifications lancées." />
        <Stat label="Tokens" value={`${compact.format(totals.inputTokens)} → ${compact.format(totals.outputTokens)}`} hint="Entrée (cache compris) → sortie." />
        <Stat label="Équivalent Claude Code" value={formatUsd(totals.subscriptionUsd)} hint="Prix API des tours sur l'abonnement : non facturé." />
      </div>

      <SectionCard title="Coût OpenRouter par jour" description={`Les ${days} derniers jours. Survole une barre pour le détail.`}>
        {totals.jobs === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Aucune génération sur la période.</p> : <CostChart byDay={usage.byDay} days={days} />}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Par utilisateur" description="Le coût que chaque compte fait porter à la clé.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead className="text-right">Générations</TableHead>
                <TableHead className="text-right">OpenRouter</TableHead>
                <TableHead className="text-right">Claude Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.byUser.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucune donnée.
                  </TableCell>
                </TableRow>
              )}
              {usage.byUser.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <span className="block font-medium">{row.name ?? row.email}</span>
                    {row.name && <span className="text-xs text-muted-foreground">{row.email}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatUsd(row.costUsd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{row.subscriptionUsd > 0 ? formatUsd(row.subscriptionUsd) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Par modèle" description="Où part la dépense, et le volume de tokens.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modèle</TableHead>
                <TableHead className="text-right">Générations</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Coût</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.byModel.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucune donnée.
                  </TableCell>
                </TableRow>
              )}
              {usage.byModel.map((row) => (
                <TableRow key={`${row.backend}:${row.model}`}>
                  <TableCell>
                    <span className="block font-mono text-xs">{row.model ?? "—"}</span>
                    <Badge variant="outline" className="mt-1">
                      {row.backend === "claude-code" ? "Claude Code" : "OpenRouter"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {compact.format(row.inputTokens)} → {compact.format(row.outputTokens)}
                  </TableCell>
                  <TableCell className={row.backend === "claude-code" ? "text-right text-muted-foreground tabular-nums" : "text-right font-medium tabular-nums"}>
                    {formatUsd(row.costUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      <SectionCard
        title="Escalades"
        description="Les étapes reprises par le modèle d'escalade après deux réponses invalides ou deux check en échec, et ce que ces reprises ont coûté."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modèle d&apos;escalade</TableHead>
              <TableHead>Étapes</TableHead>
              <TableHead className="text-right">Escalades</TableHead>
              <TableHead className="text-right">Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.escalations.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Aucune escalade sur la période.
                </TableCell>
              </TableRow>
            )}
            {usage.escalations.map((row) => (
              <TableRow key={row.model ?? "—"}>
                <TableCell className="font-mono text-xs">{row.model ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.steps.map((step) => MODEL_SLOT_META[step as keyof typeof MODEL_SLOT_META]?.label ?? step).join(", ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatUsd(row.costUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
