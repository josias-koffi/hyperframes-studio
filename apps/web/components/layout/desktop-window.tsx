"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

declare global {
  interface Window {
    /** Exposed by the desktop app's preload (apps/desktop/src/preload.ts); absent in a browser. */
    framesmith?: { platform: string; setTitleBarTheme: (theme: "light" | "dark") => void };
  }
}

/** In the desktop app, marks the page for its title bar styles and keeps the window's buttons on the page's theme. */
export function DesktopWindow() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (window.framesmith) document.documentElement.dataset.desktop = window.framesmith.platform;
  }, []);

  useEffect(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") window.framesmith?.setTitleBarTheme(resolvedTheme);
  }, [resolvedTheme]);

  return null;
}
