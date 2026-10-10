import { Global, Module } from "@nestjs/common";
import { createJobBus } from "@studio/db";

/** The queues of the workers and the live channels of their jobs, shared in the process with the workers. */
export const JOB_BUS = Symbol("JOB_BUS");

@Global()
@Module({
  providers: [{ provide: JOB_BUS, useFactory: () => createJobBus() }],
  exports: [JOB_BUS],
})
export class QueuesModule {}
