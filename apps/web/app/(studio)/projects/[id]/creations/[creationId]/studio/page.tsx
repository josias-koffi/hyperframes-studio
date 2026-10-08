import type { Metadata } from "next";
import { StudioFrame } from "@/components/project/studio-frame";
import { loadCreation } from "@/lib/creation-data";
import { studioBlockedReason } from "@/lib/creation-state";

export const metadata: Metadata = { title: "Studio HyperFrames" };

/** The HyperFrames editor (timeline, texts, animations) of the création, inside the app. */
export default async function StudioPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/studio">) {
  const { creationId: id } = await params;
  const { creation, state } = await loadCreation(id);
  return <StudioFrame creationId={creation.id} blockedReason={studioBlockedReason(creation, state)} />;
}
