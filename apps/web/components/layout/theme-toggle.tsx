"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
          <span className="sr-only">Changer de thème</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Thème clair / sombre</TooltipContent>
    </Tooltip>
  );
}
