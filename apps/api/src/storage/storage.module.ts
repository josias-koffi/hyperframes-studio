import { Global, Module } from "@nestjs/common";
import { createStorage } from "@studio/storage";
import { FilesController } from "./files.controller";
import { STORAGE } from "./storage.token";

export { STORAGE };

@Global()
@Module({
  controllers: [FilesController],
  providers: [{ provide: STORAGE, useFactory: () => createStorage() }],
  exports: [STORAGE],
})
export class StorageModule {}
