import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Database, JobBus } from "@studio/db";
import { sql } from "drizzle-orm";
import { Public } from "./auth/auth.guard";
import { DATABASE } from "./database/database.module";
import { JOB_BUS } from "./queues/queues.module";

@Public()
@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_BUS) private readonly bus: JobBus,
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
      await this.bus.ping();
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", service: "api" });
    }
    return { status: "ok", service: "api", database: "ok", redis: "ok" };
  }
}
