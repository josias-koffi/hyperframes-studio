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
  // HOST=127.0.0.1 in the desktop app: nothing on the network reaches it.
  const port = process.env.PORT ?? 3333;
  const host = process.env.HOST?.trim();
  await (host ? app.listen(port, host) : app.listen(port));
  return app;
}

// Started by the desktop app's core process, which imports `bootstrap` instead.
if (process.env.NODE_ENV !== "test" && require.main === module) {
  loadEnvironmentFiles();
  void bootstrap();
}
