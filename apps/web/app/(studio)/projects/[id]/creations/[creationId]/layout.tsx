import { CreationShell } from "@/components/project/creation-shell";

export const dynamic = "force-dynamic";

export default async function CreationLayout({ children, params }: LayoutProps<"/projects/[id]/creations/[creationId]">) {
  const { id, creationId } = await params;
  return (
    <CreationShell projectId={id} id={creationId}>
      {children}
    </CreationShell>
  );
}
