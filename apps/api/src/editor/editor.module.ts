import { Module } from "@nestjs/common";
import { CreationsModule } from "../creations/creations.module";
import { EditorController } from "./editor.controller";
import { EditorService } from "./editor.service";

@Module({
  imports: [CreationsModule],
  controllers: [EditorController],
  providers: [EditorService],
})
export class EditorModule {}
