import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { createCreationSchema, listCreationsQuerySchema, type CreateCreation, type ListCreationsQuery } from "../creations/creations.schemas";
import { CreationsService } from "../creations/creations.service";
import { ZodPipe } from "../shared/zod.pipe";
import { createProjectSchema, updateProjectSchema, type CreateProject, type UpdateProject } from "./projects.schemas";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(CreationsService) private readonly creations: CreationsService,
  ) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Post()
  create(@Body(new ZodPipe(createProjectSchema)) body: CreateProject) {
    return this.projects.create(body);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.get(id);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateProjectSchema)) body: UpdateProject) {
    return this.projects.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.remove(id);
  }

  @Get(":id/creations")
  async listCreations(@Param("id", ParseUUIDPipe) id: string, @Query(new ZodPipe(listCreationsQuerySchema)) query: ListCreationsQuery) {
    await this.projects.get(id);
    return this.creations.list({ ...query, projectId: id });
  }

  @Post(":id/creations")
  createCreation(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(createCreationSchema)) body: CreateCreation) {
    return this.creations.create(id, body);
  }
}
