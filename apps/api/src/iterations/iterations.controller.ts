import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ZodPipe } from "../shared/zod.pipe";
import {
  createIterationSchema,
  renderIterationSchema,
  updateIterationSchema,
  type CreateIteration,
  type RenderIteration,
  type UpdateIteration,
} from "./iterations.schemas";
import { IterationsService } from "./iterations.service";

@Controller()
export class IterationsController {
  constructor(@Inject(IterationsService) private readonly iterations: IterationsService) {}

  @Get("projects/:projectId/iterations")
  list(@Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.iterations.list(projectId);
  }

  @Post("projects/:projectId/iterations")
  create(@Param("projectId", ParseUUIDPipe) projectId: string, @Body(new ZodPipe(createIterationSchema)) body: CreateIteration) {
    return this.iterations.create(projectId, body);
  }

  @Get("iterations/:id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.iterations.get(id);
  }

  @Patch("iterations/:id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateIterationSchema)) body: UpdateIteration) {
    return this.iterations.update(id, body);
  }

  @Delete("iterations/:id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.iterations.remove(id);
  }

  @Post("iterations/:id/render")
  render(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(renderIterationSchema)) body: RenderIteration) {
    return this.iterations.render(id, body);
  }

  @Get("iterations/:id/renders")
  renders(@Param("id", ParseUUIDPipe) id: string) {
    return this.iterations.renders(id);
  }

  @Get("iterations/:id/jobs")
  jobs(@Param("id", ParseUUIDPipe) id: string) {
    return this.iterations.jobsOf(id);
  }
}
