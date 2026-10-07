import type { Metadata } from "next";
import { StudioFrame } from "@/components/project/studio-frame";
import { loadProject } from "@/lib/project-data";
import { studioBlockedReason } from "@/lib/project-state";

export const metadata: Metadata = { title: "Studio HyperFrames" };

/** The HyperFrames editor (timeline, texts, animations) of the project, inside the app. */
export default async function StudioPage({ params }: PageProps<"/projects/[id]/studio">) {
  const { id } = await params;
  const { project, state } = await loadProject(id);
  return <StudioFrame projectId={project.id} blockedReason={studioBlockedReason(project, state)} />;
}
