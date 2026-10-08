import { AppSidebar } from "@/components/layout/app-sidebar";
import { CrumbLabelProvider } from "@/components/layout/crumb-label";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { loadOverview } from "@/lib/overview";

/** Sidebar counters must not take the whole shell down when the API is unreachable: the page will say so. */
async function loadCounters() {
  try {
    const projects = await loadOverview();
    const review = projects.filter((project) => project.state.phase === "review");
    return {
      reviewCount: review.filter((project) => project.kind === "oneshot").length,
      templateReviewCount: review.filter((project) => project.kind === "template").length,
      liveCount: projects.filter((project) => project.state.phase === "running" || project.state.rendering).length,
    };
  } catch {
    return { reviewCount: 0, templateReviewCount: 0, liveCount: 0 };
  }
}

export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const counters = await loadCounters();

  return (
    // One screen high: sidebar and header stay put, only the content under the header scrolls.
    <SidebarProvider
      className="h-svh overflow-clip"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 60)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <CrumbLabelProvider>
        <AppSidebar variant="inset" {...counters} />
        <SidebarInset className="min-h-0 overflow-clip">
          <SiteHeader />
          <div className="@container/main flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-4 *:shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 md:py-6">
            {children}
          </div>
        </SidebarInset>
      </CrumbLabelProvider>
    </SidebarProvider>
  );
}
