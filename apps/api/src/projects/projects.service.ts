import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { assets, creations, projects, type Database } from "@studio/db";
import { CREATION_TYPES, type CreationType } from "@studio/shared";
import { and, desc, eq } from "drizzle-orm";
import { currentUserId } from "../auth/request-context";
import { CreationsService } from "../creations/creations.service";
import { DATABASE } from "../database/database.module";
import type { CreateProject, UpdateProject } from "./projects.schemas";

type CreationItem = Awaited<ReturnType<CreationsService["list"]>>[number];

/** What a project holds, for the projects list: créations per type, templates, and what waits on the user. */
export function summarize(items: CreationItem[]) {
  const counts = Object.fromEntries(CREATION_TYPES.map((type) => [type, 0])) as Record<CreationType, number>;
  for (const item of items) counts[item.type] += 1;
  return {
    counts,
    templateCount: items.filter((item) => item.kind === "template").length,
    reviewCount: items.filter((item) => item.lastClaudeJob?.status === "waiting_review").length,
    runningCount: items.filter((item) => ["queued", "running"].includes(item.lastClaudeJob?.status ?? "")).length,
    covers: items.map((item) => item.cover).filter((cover) => cover !== null).slice(0, 3),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CreationsService) private readonly creations: CreationsService,
  ) {}

  /** Projects, most recently active first (a création's activity counts as the project's). */
  async list() {
    const [rows, items] = await Promise.all([this.db.select().from(projects).where(eq(projects.ownerId, currentUserId())).orderBy(desc(projects.updatedAt)), this.creations.list()]);
    return rows
      .map((row) => {
        const own = items.filter((item) => item.projectId === row.id);
        const activity = Math.max(row.updatedAt.getTime(), ...own.map((item) => item.updatedAt.getTime()));
        return { ...row, ...summarize(own), activityAt: new Date(activity) };
      })
      .sort((a, b) => b.activityAt.getTime() - a.activityAt.getTime());
  }

  /** The signed-in person's project: someone else's is as unknown as a missing one. */
  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, currentUserId())));
    if (!row) throw new NotFoundException("project not found");
    return row;
  }

  async create(input: CreateProject) {
    const [row] = await this.db.insert(projects).values({ ...input, ownerId: currentUserId() }).returning();
    return row;
  }

  async update(id: string, input: UpdateProject) {
    await this.get(id);
    const [row] = await this.db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return row;
  }

  /** Removes the project with every création, render, asset and folder. Refused while Claude works on one. */
  async remove(id: string) {
    await this.get(id);
    const own = await this.db.select({ id: creations.id, slug: creations.slug }).from(creations).where(eq(creations.projectId, id));
    const ids = own.map((row) => row.id);
    await this.creations.assertIdle(ids, "Claude travaille sur une création de ce projet : attends la fin de l'étape.");
    const [keys, assetRows] = await Promise.all([
      this.creations.storedKeys(ids),
      this.db.select({ key: assets.storageKey }).from(assets).where(eq(assets.projectId, id)),
    ]);
    await this.db.delete(projects).where(eq(projects.id, id));
    await this.creations.discard([...new Set([...keys, ...assetRows.map((row) => row.key)])], own.map((row) => row.slug));
    return { id };
  }
}
