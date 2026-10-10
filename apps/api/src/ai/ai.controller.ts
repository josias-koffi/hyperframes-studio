import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { aiPreferencesSchema, type AiPreferences } from "@studio/shared";
import { AdminGuard } from "../auth/admin.guard";
import { ZodPipe } from "../shared/zod.pipe";
import {
  createAiModelSchema,
  listAiModelsQuerySchema,
  openRouterSearchSchema,
  updateAiModelSchema,
  usageQuerySchema,
  userAiSettingsSchema,
  type CreateAiModel,
  type ListAiModelsQuery,
  type OpenRouterSearch,
  type UpdateAiModel,
  type UsageQuery,
  type UserAiSettingsInput,
} from "./ai.schemas";
import { AiService } from "./ai.service";

/** What every signed-in person sees: the offered models and their own choices. */
@Controller()
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  @Get("ai-models")
  list(@Query(new ZodPipe(listAiModelsQuerySchema)) query: ListAiModelsQuery) {
    return this.ai.listEnabled(query.kind);
  }

  @Get("me/ai-settings")
  mine() {
    return this.ai.getMySettings();
  }

  @Put("me/ai-settings")
  saveMine(@Body(new ZodPipe(userAiSettingsSchema)) body: UserAiSettingsInput) {
    return this.ai.saveMySettings(body);
  }
}

@Controller("admin")
@UseGuards(AdminGuard)
export class AiAdminController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  @Get("ai-models")
  list(@Query(new ZodPipe(listAiModelsQuerySchema)) query: ListAiModelsQuery) {
    return this.ai.listAll(query.kind);
  }

  @Post("ai-models")
  create(@Body(new ZodPipe(createAiModelSchema)) body: CreateAiModel) {
    return this.ai.create(body);
  }

  @Patch("ai-models/:id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateAiModelSchema)) body: UpdateAiModel) {
    return this.ai.update(id, body);
  }

  @Delete("ai-models/:id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.ai.remove(id);
  }

  @Get("openrouter-models")
  searchOpenRouter(@Query(new ZodPipe(openRouterSearchSchema)) query: OpenRouterSearch) {
    return this.ai.searchOpenRouter(query);
  }

  @Get("ai-defaults")
  defaults() {
    return this.ai.getDefaults();
  }

  @Put("ai-defaults")
  saveDefaults(@Body(new ZodPipe(aiPreferencesSchema)) body: AiPreferences) {
    return this.ai.saveDefaults(body);
  }

  @Get("usage")
  usage(@Query(new ZodPipe(usageQuerySchema)) query: UsageQuery) {
    return this.ai.usage(query.days);
  }
}
