import { Module } from "@nestjs/common";
import { AiAdminController, AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  controllers: [AiController, AiAdminController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
