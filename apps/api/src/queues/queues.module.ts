import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createJobBus, type JobBus } from "@studio/db";

/** The queues of the workers and the live channels of their jobs: Redis, or memory in the desktop app. */
export const JOB_BUS = Symbol("JOB_BUS");

@Global()
@Module({
  providers: [{ provide: JOB_BUS, useFactory: () => createJobBus() }],
  exports: [JOB_BUS],
})
export class QueuesModule implements OnApplicationShutdown {
  constructor(@Inject(JOB_BUS) private readonly bus: JobBus) {}

  async onApplicationShutdown() {
    await this.bus.close();
  }
}
