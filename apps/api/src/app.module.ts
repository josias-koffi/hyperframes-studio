// Every constructor dependency uses an explicit @Inject(...): `pnpm dev` runs through tsx (esbuild), which
// emits no decorator metadata, so Nest cannot resolve dependencies by their type there.
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { AiModule } from "./ai/ai.module";
import { AssetsController } from "./assets/assets.controller";
import { AuthContextMiddleware } from "./auth/auth-context.middleware";
import { AuthModule } from "./auth/auth.module";
import { CreationsModule } from "./creations/creations.module";
import { DatabaseModule } from "./database/database.module";
import { EditorModule } from "./editor/editor.module";
import { HealthController } from "./health.controller";
import { IterationsModule } from "./iterations/iterations.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueuesModule } from "./queues/queues.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [DatabaseModule, AuthModule, AiModule, QueuesModule, StorageModule, CreationsModule, EditorModule, ProjectsModule, IterationsModule],
  controllers: [HealthController, AssetsController],
})
export class AppModule implements NestModule {
  /** Every request, public or not, runs inside the request context that carries its signed-in person. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthContextMiddleware).forRoutes("{*splat}");
  }
}
