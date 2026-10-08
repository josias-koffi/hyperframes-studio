import type { Metadata } from "next";
import { EditorShell } from "@/components/editor/editor-shell";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { loadCreation } from "@/lib/creation-data";
import { creationHref, editorBlockedReason } from "@/lib/creation-state";

export const metadata: Metadata = { title: "Éditeur" };

/** Framesmith's editor of the création, full screen: video editor or image / carousel editor. */
export default async function StudioPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/studio">) {
  const { creationId: id } = await params;
  const { creation, state } = await loadCreation(id);
  const blocked = editorBlockedReason(creation, state);
  if (blocked) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Éditeur indisponible</EmptyTitle>
          <EmptyDescription>{blocked}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <EditorShell creationId={creation.id} backHref={creationHref(creation)} />;
}
