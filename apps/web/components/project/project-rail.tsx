"use client";

import { CheckIcon, FolderOpenIcon, LayoutDashboardIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PIPELINE } from "@/components/studio/labels";
import { STEP_SEGMENTS, type ProjectState, type StepState } from "@/lib/project-state";
import { cn } from "@/lib/utils";

const MARK: Record<StepState, string> = {
  done: "border-success bg-success text-white dark:text-background",
  current: "border-primary text-primary",
  running: "border-rec bg-rec/10 text-rec animate-(--animate-rec-pulse)",
  review: "border-warning bg-warning/10 text-warning",
  failed: "border-destructive bg-destructive/10 text-destructive",
  todo: "border-border text-muted-foreground",
};

const CAPTION: Record<StepState, string> = {
  done: "Terminé",
  current: "À lancer",
  running: "En cours",
  review: "À valider",
  failed: "Échec",
  todo: "À venir",
};

function RailLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
        active && "bg-accent font-medium text-accent-foreground shadow-surface",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The project's own navigation: one entry per screen, each step with where it stands.
 * A column beside the content on large screens, a scrolling strip of tabs above it otherwise.
 */
export function ProjectRail({ projectId, steps, assetCount }: { projectId: string; steps: ProjectState["steps"]; assetCount: number }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  // The Studio editor takes the whole width: the header's button leads back.
  if (pathname === `${base}/studio`) return null;

  return (
    <nav
      aria-label="Étapes du projet"
      className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-0 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
    >
      <RailLink href={base} active={pathname === base}>
        <LayoutDashboardIcon className="size-4 text-muted-foreground" />
        Vue d&apos;ensemble
      </RailLink>
      <p className="mt-3 mb-1 hidden px-3 text-xs font-medium text-muted-foreground lg:block">Étapes</p>
      {steps.map(({ step, state }, index) => {
        const href = `${base}/${STEP_SEGMENTS[step]}`;
        const Icon = PIPELINE[step].icon;
        return (
          <RailLink key={step} href={href} active={pathname === href}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold", MARK[state])}>
              {state === "done" ? (
                <CheckIcon className="size-3.5" strokeWidth={3} />
              ) : state === "failed" ? (
                <XIcon className="size-3.5" strokeWidth={3} />
              ) : state === "running" || state === "review" ? (
                <Icon className="size-3" />
              ) : (
                index + 1
              )}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="whitespace-nowrap">{PIPELINE[step].label}</span>
              <span className="hidden text-xs font-normal text-muted-foreground lg:block">{CAPTION[state]}</span>
            </span>
          </RailLink>
        );
      })}
      <div className="my-2 hidden border-t lg:block" />
      <RailLink href={`${base}/assets`} active={pathname === `${base}/assets`}>
        <FolderOpenIcon className="size-4 text-muted-foreground" />
        Assets
        <span className="ml-auto rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{assetCount}</span>
      </RailLink>
    </nav>
  );
}
