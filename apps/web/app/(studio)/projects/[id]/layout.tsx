import { ProjectShell } from "@/components/project/project-shell";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  return (
    <ProjectShell id={id} section="oneshot">
      {children}
    </ProjectShell>
  );
}
