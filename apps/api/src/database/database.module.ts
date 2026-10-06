import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDatabaseClient, type DatabaseClient } from "@studio/db";

export const DATABASE = Symbol("DATABASE");
const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

@Global()
@Module({
  providers: [
    { provide: DATABASE_CLIENT, useFactory: () => createDatabaseClient() },
    { provide: DATABASE, inject: [DATABASE_CLIENT], useFactory: (client: DatabaseClient) => client.db },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: DatabaseClient) {}

  async onApplicationShutdown() {
    await this.client.close();
  }
}
