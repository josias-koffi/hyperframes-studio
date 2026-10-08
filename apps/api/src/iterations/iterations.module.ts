import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { IterationsController } from "./iterations.controller";
import { IterationsService } from "./iterations.service";

@Module({
  imports: [ProjectsModule],
  controllers: [IterationsController],
  providers: [IterationsService],
})
export class IterationsModule {}
