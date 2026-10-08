// Every constructor dependency uses an explicit @Inject(...): `pnpm dev` runs through tsx (esbuild), which
// emits no decorator metadata, so Nest cannot resolve dependencies by their type there.
import { Module } from "@nestjs/common";
import { AssetsController } from "./assets/assets.controller";
import { CreationsModule } from "./creations/creations.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { IterationsModule } from "./iterations/iterations.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueuesModule } from "./queues/queues.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [DatabaseModule, QueuesModule, StorageModule, CreationsModule, ProjectsModule, IterationsModule],
  controllers: [HealthController, AssetsController],
})
export class AppModule {}
