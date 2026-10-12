import { RefreshButton } from "./refresh-button";
import { ThemeToggle } from "./theme-toggle";

/**
 * The strip above the page, on the sidebar's background: it moves the desktop window, and keeps theme and refresh
 * clear of the window's buttons drawn over its right end.
 */
export function WindowBar() {
  return (
    <div data-window-drag className="flex h-12 shrink-0 items-center justify-end gap-1 pe-[calc(0.75rem+var(--titlebar-right,0px))]">
      <ThemeToggle />
      <RefreshButton />
    </div>
  );
}
