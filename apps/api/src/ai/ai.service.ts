import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { aiDefaults, aiModels, creations, jobs, projects, userAiSettings, users, type Database } from "@studio/db";
import { AI_MODEL_KINDS, FAL_MODEL_KINDS, mediaPriceOf, MODEL_SLOTS, VISION_SLOTS, type AiModelKind, type AiPreferences, type MediaPrice, type ResolvedAi } from "@studio/shared";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { currentUser } from "../auth/request-context";
import { DATABASE } from "../database/database.module";
import type { CreateAiModel, OpenRouterSearch, UpdateAiModel, UserAiSettingsInput } from "./ai.schemas";
import { fetchOpenRouterModels } from "./openrouter-catalog";
import { MissingModelError, resolveAi } from "./resolve-ai";

const EMPTY: AiPreferences = { models: {}, media: {} };

@Injectable()
export class AiService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ---- Catalog -------------------------------------------------------------------------------------------------

  /** What users may pick: the enabled models, by kind. */
  listEnabled(kind?: AiModelKind) {
    const filter = kind ? and(eq(aiModels.enabled, true), eq(aiModels.kind, kind)) : eq(aiModels.enabled, true);
    return this.db.select().from(aiModels).where(filter).orderBy(asc(aiModels.kind), asc(aiModels.label));
  }

  listAll(kind?: AiModelKind) {
    return this.db
      .select()
      .from(aiModels)
      .where(kind ? eq(aiModels.kind, kind) : undefined)
      .orderBy(asc(aiModels.kind), asc(aiModels.label));
  }

  async create(input: CreateAiModel) {
    const [row] = await this.db.insert(aiModels).values(input).onConflictDoNothing().returning();
    if (!row) throw new ConflictException("Ce modèle est déjà dans le catalogue pour ce type.");
    return row;
  }

  async update(id: string, input: UpdateAiModel) {
    const [row] = await this.db.update(aiModels).set({ ...input, updatedAt: new Date() }).where(eq(aiModels.id, id)).returning();
    if (!row) throw new NotFoundException("Modèle introuvable");
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db.delete(aiModels).where(eq(aiModels.id, id)).returning({ id: aiModels.id });
    if (!row) throw new NotFoundException("Modèle introuvable");
  }

  /**
   * Reads again from OpenRouter what the catalog models can do and cost: models added before capabilities were
   * stored, or whose provider changed them. A model OpenRouter no longer lists (a TTS added by hand) is left as is.
   */
  async refreshFromOpenRouter() {
    let models;
    try {
      models = await fetchOpenRouterModels();
    } catch (error) {
      throw new BadRequestException(`Liste OpenRouter indisponible : ${error instanceof Error ? error.message : String(error)}`);
    }
    const byId = new Map(models.map((model) => [model.id, model]));
    let updated = 0;
    for (const row of await this.db.select().from(aiModels)) {
      const model = byId.get(row.openrouterId);
      if (!model) continue;
      await this.db
        .update(aiModels)
        .set({ capabilities: model.capabilities, pricing: model.pricing, contextLength: model.contextLength, updatedAt: new Date() })
        .where(eq(aiModels.id, row.id));
      updated++;
    }
    return { updated };
  }

  /** OpenRouter's list for the import dialog, each model marked with the kinds it is already offered as. */
  async searchOpenRouter({ kind, q }: OpenRouterSearch) {
    let models;
    try {
      models = await fetchOpenRouterModels();
    } catch (error) {
      throw new BadRequestException(`Liste OpenRouter indisponible : ${error instanceof Error ? error.message : String(error)}`);
    }
    const inCatalog = await this.db.select({ id: aiModels.openrouterId, kind: aiModels.kind }).from(aiModels);
    const needle = q?.toLowerCase();
    return models
      .filter((model) => (kind ? model.kinds.includes(kind) : model.kinds.length > 0))
      .filter((model) => !needle || model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle))
      .slice(0, 100)
      .map((model) => ({ ...model, inCatalog: inCatalog.filter((row) => row.id === model.id).map((row) => row.kind) }));
  }

  // ---- Defaults and user settings ------------------------------------------------------------------------------

  async getDefaults(): Promise<AiPreferences> {
    const [row] = await this.db.select().from(aiDefaults).where(eq(aiDefaults.id, "default"));
    return row?.preferences ?? EMPTY;
  }

  async saveDefaults(preferences: AiPreferences) {
    await this.assertInCatalog(preferences);
    await this.db
      .insert(aiDefaults)
      .values({ id: "default", preferences })
      .onConflictDoUpdate({ target: aiDefaults.id, set: { preferences, updatedAt: new Date() } });
    return preferences;
  }

  async getMySettings() {
    const user = currentUser();
    const [row] = await this.db.select().from(userAiSettings).where(eq(userAiSettings.userId, user.id));
    return {
      preferences: row?.preferences ?? EMPTY,
      agentBackend: row?.agentBackend ?? "opencode",
      defaults: await this.getDefaults(),
    };
  }

  async saveMySettings({ preferences, agentBackend }: UserAiSettingsInput) {
    const user = currentUser();
    await this.assertInCatalog(preferences);
    await this.db
      .insert(userAiSettings)
      .values({ userId: user.id, preferences, agentBackend })
      .onConflictDoUpdate({ target: userAiSettings.userId, set: { preferences, agentBackend, updatedAt: new Date() } });
    return this.getMySettings();
  }

  /** The settings the signed-in person's next generation runs with, frozen into its jobs. */
  async resolveForCurrentUser(): Promise<ResolvedAi> {
    const user = currentUser();
    const [[own], defaults, enabledRows] = await Promise.all([
      this.db.select().from(userAiSettings).where(eq(userAiSettings.userId, user.id)),
      this.getDefaults(),
      this.listEnabled(),
    ]);
    const enabled = Object.fromEntries(
      AI_MODEL_KINDS.map((kind) => [kind, new Set(enabledRows.filter((row) => row.kind === kind).map((row) => row.openrouterId))]),
    ) as Record<AiModelKind, Set<string>>;
    const vision = new Set(enabledRows.filter((row) => row.kind === "agent" && row.capabilities.includes("vision")).map((row) => row.openrouterId));
    const prices: Record<string, MediaPrice> = {};
    for (const row of enabledRows.filter((candidate) => FAL_MODEL_KINDS.includes(candidate.kind))) {
      const price = mediaPriceOf(row.kind, row.pricing);
      if (price) prices[row.openrouterId] = price;
    }
    try {
      return resolveAi({
        user: own ? { preferences: own.preferences, agentBackend: own.agentBackend } : null,
        defaults,
        enabled,
        vision,
        prices,
      });
    } catch (error) {
      if (error instanceof MissingModelError) throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Every model named must be enabled in the catalog for its kind, and a voice must be one of its model's. */
  private async assertInCatalog(preferences: AiPreferences) {
    const enabled = await this.listEnabled();
    const find = (kind: AiModelKind, id: string) => enabled.find((row) => row.kind === kind && row.openrouterId === id);
    for (const slot of MODEL_SLOTS) {
      const id = preferences.models[slot];
      if (!id) continue;
      const model = find("agent", id);
      if (!model) throw new BadRequestException(`Modèle « ${id} » non proposé pour l'étape ${slot}.`);
      if (VISION_SLOTS.includes(slot) && !model.capabilities.includes("vision"))
        throw new BadRequestException(`${model.label} ne lit pas les images : il ne peut pas servir à l'étape ${slot}.`);
    }
    const { ttsModel, ttsVoice, musicModel } = preferences.media;
    const tts = ttsModel ? find("tts", ttsModel) : undefined;
    if (ttsModel && !tts) throw new BadRequestException(`Voix de synthèse « ${ttsModel} » non proposée.`);
    if (musicModel && !find("music", musicModel)) throw new BadRequestException(`Modèle de musique « ${musicModel} » non proposé.`);
    const { imageModel, videoDraftModel, videoFinalModel } = preferences.media;
    if (imageModel && !find("image", imageModel)) throw new BadRequestException(`Modèle d'image « ${imageModel} » non proposé.`);
    for (const id of [videoDraftModel, videoFinalModel])
      if (id && !find("video", id)) throw new BadRequestException(`Modèle vidéo « ${id} » non proposé.`);
    if (ttsVoice && tts && tts.voices.length > 0 && !tts.voices.includes(ttsVoice)) {
      throw new BadRequestException(`La voix « ${ttsVoice} » n'existe pas pour ${tts.label}.`);
    }
  }

  // ---- Usage ---------------------------------------------------------------------------------------------------

  /**
   * Generation costs over the last `days`: totals, per day, per user and per model. Claude Code costs are what the
   * turns would cost at API prices: the subscription is not billed per turn, so they are kept apart.
   */
  async usage(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const scope = and(eq(jobs.kind, "claude"), gte(jobs.createdAt, since), isNotNull(jobs.backend));
    const billed = sql<number>`coalesce(sum(case when ${jobs.backend} = 'opencode' then ${jobs.costUsd} else 0 end), 0)::float8`;
    const subscription = sql<number>`coalesce(sum(case when ${jobs.backend} = 'claude-code' then ${jobs.costUsd} else 0 end), 0)::float8`;
    const count = sql<number>`count(*)::int`;
    const tokens = {
      inputTokens: sql<number>`coalesce(sum(${jobs.inputTokens}), 0)::float8`,
      outputTokens: sql<number>`coalesce(sum(${jobs.outputTokens}), 0)::float8`,
    };
    const day = sql<string>`to_char(date_trunc('day', ${jobs.createdAt}), 'YYYY-MM-DD')`;

    const [totals] = await this.db
      .select({ jobs: count, costUsd: billed, subscriptionUsd: subscription, ...tokens })
      .from(jobs)
      .where(scope);
    const byDay = await this.db.select({ day, jobs: count, costUsd: billed, subscriptionUsd: subscription }).from(jobs).where(scope).groupBy(day).orderBy(day);
    const byUser = await this.db
      .select({ userId: users.id, email: users.email, name: users.name, jobs: count, costUsd: billed, subscriptionUsd: subscription, ...tokens })
      .from(jobs)
      .innerJoin(creations, eq(creations.id, jobs.creationId))
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(scope)
      .groupBy(users.id)
      .orderBy(desc(billed));
    const byModel = await this.db
      .select({ backend: jobs.backend, model: jobs.model, jobs: count, costUsd: sql<number>`coalesce(sum(${jobs.costUsd}), 0)::float8`, ...tokens })
      .from(jobs)
      .where(scope)
      .groupBy(jobs.backend, jobs.model)
      .orderBy(desc(sql`coalesce(sum(${jobs.costUsd}), 0)`));

    // A step that fell back to the escalation slot: how often, on which model and at what share of its cost.
    const escalations = await this.db
      .select({
        model: jobs.escalationModel,
        steps: sql<string[]>`array_agg(distinct ${jobs.step})`,
        jobs: count,
        costUsd: sql<number>`coalesce(sum(${jobs.escalationCostUsd}), 0)::float8`,
      })
      .from(jobs)
      .where(and(scope, isNotNull(jobs.escalationModel)))
      .groupBy(jobs.escalationModel)
      .orderBy(desc(count));

    return { days, since: since.toISOString(), totals, byDay, byUser, byModel, escalations };
  }
}
