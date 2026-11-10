import type { LibraryLicense, LibraryNotices } from "@studio/shared/browser";
import { LibraryIcon } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "À propos" };

const LICENSES: Record<LibraryLicense, string> = {
  "CC0-1.0": "CC0 1.0, sans condition",
  "public-domain": "Domaine public",
  MIT: "Licence MIT",
  ISC: "Licence ISC",
  "Apache-2.0": "Licence Apache 2.0",
};

export default async function AboutPage() {
  const { packs } = await serverApi<LibraryNotices>("/library/notices");

  return (
    <>
      <PageHeader
        title="À propos"
        description="Les agents illustrent les créations avec une bibliothèque d'assets libres livrée avec l'app. Voici leurs auteurs et leurs licences."
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 lg:px-6">
        {packs.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LibraryIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun pack dans la bibliothèque</EmptyTitle>
              <EmptyDescription>Cette version de l&apos;app ne livre encore aucun asset tiers.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          packs.map((pack) => (
            <Card key={pack.pack}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {pack.pack}
                  <Badge variant="secondary">{LICENSES[pack.license]}</Badge>
                </CardTitle>
                <CardDescription>
                  {pack.assets} asset{pack.assets > 1 ? "s" : ""}
                  {pack.authors.length > 0 && <> · {pack.authors.join(", ")}</>}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <ul className="flex flex-col gap-1">
                  {pack.sources.map((source) => (
                    <li key={source}>
                      <a href={source} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
                        {source}
                      </a>
                    </li>
                  ))}
                </ul>
                {pack.text && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">Texte de la licence</summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{pack.text}</pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
