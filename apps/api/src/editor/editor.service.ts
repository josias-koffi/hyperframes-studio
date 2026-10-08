import { stat } from "node:fs/promises";
import { join } from "node:path";
import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { assets, type Database } from "@studio/db";
import { commitCheckpoint, resolveWorkspaceDir } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, eq } from "drizzle-orm";
import { currentUserId } from "../auth/request-context";
import { DATABASE } from "../database/database.module";
import { STORAGE } from "../storage/storage.module";
import { CreationsService, type Creation } from "../creations/creations.service";
import { JobsService } from "../creations/jobs.service";

const ACTIVE = ["queued", "running"];

export type EditRequest = { text: string; context?: string };

/** The HyperFrames engine (apps/hf-studio), reached on the internal network with the shared token. */
export function engineBase() {
  return (process.env.HF_STUDIO_URL?.trim() || "http://localhost:3344").replace(/\/+$/, "");
}

export function engineHeaders(): Record<string, string> {
  const token = process.env.HF_STUDIO_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Framesmith's editor: the création's folder opened in the engine, written by the user through the engine's
 * mutations, and by Claude when the user asks for a change. Both write the same files, never at the same time.
 */
@Injectable()
export class EditorService {
  private readonly targets = new Map<string, { creation: Creation; until: number }>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(CreationsService) private readonly creations: CreationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  private async activeJob(id: string) {
    const last = await this.creations.lastClaudeJob(id);
    return last && ACTIVE.includes(last.status) ? last : null;
  }

  async assertWritable(id: string) {
    if (await this.activeJob(id)) throw new ConflictException("Claude modifie cette création : attends la fin de sa modification.");
  }

  /** Opens the création in the engine (idempotent): its folder must exist, i.e. the build has started. */
  async openInEngine(creation: Creation) {
    try {
      await stat(join(resolveWorkspaceDir(), "videos", creation.slug, "index.html"));
    } catch {
      throw new ConflictException("La création n'a pas encore de composition à éditer.");
    }
    const response = await fetch(`${engineBase()}/__gateway/open`, {
      method: "POST",
      headers: { "content-type": "application/json", ...engineHeaders() },
      body: JSON.stringify({ slug: creation.slug }),
    }).catch(() => null);
    if (!response?.ok) {
      const detail = response ? ((await response.json().catch(() => null)) as { message?: string } | null)?.message : null;
      throw new BadGatewayException(detail ?? "Le moteur HyperFrames (hf-studio) est injoignable.");
    }
  }

  /**
   * The création behind an engine request (its slug), remembered for a minute: a preview loads dozens of files,
   * one database read is enough.
   */
  async engineTarget(id: string): Promise<Creation> {
    // Remembered per person: the lookup is also the ownership check.
    const key = `${currentUserId()}:${id}`;
    const known = this.targets.get(key);
    if (known && known.until > Date.now()) return known.creation;
    const creation = await this.creations.get(id);
    this.targets.set(key, { creation, until: Date.now() + 60_000 });
    if (this.targets.size > 1000) this.targets.delete(this.targets.keys().next().value!);
    return creation;
  }

  /** What the editor needs to start: the création, whether Claude holds it, and the engine ready. */
  async open(id: string) {
    const creation = await this.creations.get(id);
    await this.openInEngine(creation);
    // Building the preview stamps ids on the source files (`data-hf-id`): done before the editor reads them, so
    // its copy and the preview's page name the same elements.
    await fetch(`${engineBase()}/api/projects/${encodeURIComponent(creation.slug)}/preview`, { headers: engineHeaders() })
      .then((response) => response.body?.cancel())
      .catch(() => null);
    const job = await this.activeJob(id);
    return {
      creation,
      lockedBy: job ? { jobId: job.id, step: job.step } : null,
    };
  }

  /**
   * Copies an asset the création may use (the campaign's, its own, or the owner's library) into its folder, where
   * the composition can reference it.
   */
  async importAsset(id: string, assetId: string) {
    const creation = await this.creations.get(id);
    await this.assertWritable(id);
    const [asset] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.ownerId, currentUserId())));
    if (!asset) throw new NotFoundException("asset not found");
    const visible = (asset.projectId === null || asset.projectId === creation.projectId) && (asset.creationId === null || asset.creationId === id);
    if (!visible) throw new BadRequestException("Ce média n'appartient pas à cette campagne.");
    const path = `assets/uploads/${asset.filename}`;
    await this.storage.downloadToFile(asset.storageKey, join(resolveWorkspaceDir(), "videos", creation.slug, path));
    return { path, kind: asset.kind, contentType: asset.contentType };
  }

  /** The manual edits since the last checkpoint become one commit of the workspace repository. */
  async checkpoint(id: string) {
    const creation = await this.creations.get(id);
    await this.assertWritable(id);
    await commitCheckpoint(resolveWorkspaceDir(), creation.slug, `${creation.slug}: édition manuelle`);
    return { ok: true };
  }

  /**
   * A change asked from the editor: Claude resumes the création's session on the build, without a review after.
   * The composition may have been edited by hand since Claude wrote it, which the request says.
   */
  async editRequest(id: string, request: EditRequest) {
    const creation = await this.creations.get(id);
    const last = await this.creations.lastClaudeJob(id);
    if (last && [...ACTIVE, "waiting_review"].includes(last.status)) {
      throw new ConflictException(
        last.status === "waiting_review" ? `L'étape « ${last.step} » attend ta validation : valide-la avant d'éditer.` : "Claude travaille déjà sur cette création.",
      );
    }
    if (creation.currentStep !== "build" || !last || last.step !== "build") {
      throw new ConflictException("La création n'est pas encore construite.");
    }
    const feedback = [
      "Demande faite depuis l'éditeur. La composition a pu être modifiée à la main depuis ton dernier passage : relis les fichiers avant de changer quoi que ce soit, et garde les modifications manuelles qui ne sont pas concernées.",
      request.context ? `Sélection dans l'éditeur : ${request.context}` : null,
      request.text,
    ]
      .filter(Boolean)
      .join("\n\n");
    return this.jobs.enqueueClaude({
      creationId: id,
      slug: creation.slug,
      step: "build",
      feedback,
      mode: "edit",
      resumeSessionId: creation.claudeSessionId ?? undefined,
    });
  }

  /** The création's slide count, after the editor added or removed slides. */
  async setSlideCount(id: string, slideCount: number) {
    const creation = await this.creations.get(id);
    if (creation.type !== "carousel") throw new BadRequestException("Seul un carrousel a des diapos.");
    return this.creations.setSlideCount(id, slideCount);
  }
}
