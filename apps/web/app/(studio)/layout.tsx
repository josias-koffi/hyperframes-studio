import { AppSidebar } from "@/components/layout/app-sidebar";
import { CrumbLabelProvider } from "@/components/layout/crumb-label";
import { SiteHeader } from "@/components/layout/site-header";
import { WindowBar } from "@/components/layout/window-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { redirect } from "next/navigation";
import { loadCreations } from "@/lib/overview";
import { readSessionUser } from "@/lib/server-api";

/** Sidebar counters must not take the whole shell down when the API is unreachable: the page will say so. */
async function loadCounters() {
  try {
    const creations = await loadCreations();
    const review = creations.filter((creation) => creation.state.phase === "review");
    return {
      reviewCount: review.filter((creation) => creation.kind === "oneshot").length,
      templateReviewCount: review.filter((creation) => creation.kind === "template").length,
      liveCount: creations.filter((creation) => creation.state.phase === "running" || creation.state.rendering).length,
    };
  } catch {
    return { reviewCount: 0, templateReviewCount: 0, liveCount: 0 };
  }
}

export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const user = await readSessionUser();
  if (!user) redirect("/login");
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
        <AppSidebar variant="inset" user={user} {...counters} />
        {/* The window bar above the page: around the page's card, the inset variant's margins, the top one aside. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pr-2 md:pb-2 md:peer-data-[state=collapsed]:pl-2">
          <WindowBar />
          <SidebarInset className="min-h-0 overflow-clip md:rounded-xl md:shadow-sm">
            <SiteHeader />
            <div className="@container/main flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-4 *:shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 md:py-6">
              {children}
            </div>
          </SidebarInset>
        </div>
      </CrumbLabelProvider>
    </SidebarProvider>
  );
}
