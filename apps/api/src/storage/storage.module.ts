import { Global, Module } from "@nestjs/common";
import { createStorage } from "@studio/storage";

export const STORAGE = Symbol("STORAGE");

@Global()
@Module({
  providers: [{ provide: STORAGE, useFactory: () => createStorage() }],
  exports: [STORAGE],
})
export class StorageModule {}
