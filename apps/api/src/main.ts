import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { loadEnvironmentFiles } from "@studio/shared";

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ credentials: true, origin: process.env.WEB_URL ?? "http://localhost:3010" });
  app.set("trust proxy", 1);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3333);
  return app;
}

if (process.env.NODE_ENV !== "test") {
  loadEnvironmentFiles();
  void bootstrap();
}
