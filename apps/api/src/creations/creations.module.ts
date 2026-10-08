import { Module } from "@nestjs/common";
import { CreationsController } from "./creations.controller";
import { CreationsService } from "./creations.service";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  controllers: [CreationsController, JobsController],
  providers: [CreationsService, JobsService],
  exports: [CreationsService, JobsService],
})
export class CreationsModule {}
