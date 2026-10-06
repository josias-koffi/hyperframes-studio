import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { QUEUES } from "@studio/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const REDIS = Symbol("REDIS");

@Injectable()
export class QueuesService implements OnApplicationShutdown {
  readonly claude: Queue;
  readonly render: Queue;

  constructor(@Inject(REDIS) private readonly redis: IORedis) {
    this.claude = new Queue(QUEUES.claude, { connection: redis });
    this.render = new Queue(QUEUES.render, { connection: redis });
  }

  async onApplicationShutdown() {
    await Promise.all([this.claude.close(), this.render.close()]);
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new IORedis(process.env.REDIS_URL?.trim() || "redis://localhost:6390", { maxRetriesPerRequest: null }),
    },
    QueuesService,
  ],
  exports: [REDIS, QueuesService],
})
export class QueuesModule {}
