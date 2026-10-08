import { Module } from "@nestjs/common";
import { CreationsModule } from "../creations/creations.module";
import { IterationsController } from "./iterations.controller";
import { IterationsService } from "./iterations.service";

@Module({
  imports: [CreationsModule],
  controllers: [IterationsController],
  providers: [IterationsService],
})
export class IterationsModule {}
