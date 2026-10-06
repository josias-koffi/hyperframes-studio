import { Module } from "@nestjs/common";
import { JobsController } from "../jobs/jobs.controller";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController, JobsController],
  providers: [ProjectsService, JobsService],
  exports: [ProjectsService, JobsService],
})
export class ProjectsModule {}
