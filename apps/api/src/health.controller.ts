import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Database } from "@studio/db";
import { sql } from "drizzle-orm";
import type IORedis from "ioredis";
import { Public } from "./auth/auth.guard";
import { DATABASE } from "./database/database.module";
import { REDIS } from "./queues/queues.module";

@Public()
@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  /** Liveness, used by the infra smoke test. */
  @Get("health")
  health() {
    return { status: "ok", service: "api" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
      await this.redis.ping();
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", service: "api" });
    }
    return { status: "ok", service: "api", database: "ok", redis: "ok" };
  }
}
