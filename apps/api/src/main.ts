import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

/** Started by the app's core process, next to the workers. It listens on the loopback only. */
export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ credentials: true, origin: process.env.WEB_URL ?? "http://localhost:3010" });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3343, process.env.HOST?.trim() || "127.0.0.1");
  return app;
}
