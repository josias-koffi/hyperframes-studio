import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { Database } from "@studio/db";
import { DATABASE } from "../database/database.module";
import { AuthContextMiddleware } from "./auth-context.middleware";
import { resolveAuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { createPgAuthAccountStore } from "./auth.pg-store";
import { AuthService } from "./auth.service";
import { AUTH_CONFIG } from "./auth.tokens";
import { AUTH_ACCOUNT_STORE, type AuthAccountStore, type AuthConfig } from "./auth.types";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => resolveAuthConfig(process.env) },
    { provide: AUTH_ACCOUNT_STORE, inject: [DATABASE], useFactory: (db: Database) => createPgAuthAccountStore(db) },
    {
      provide: AuthService,
      inject: [AUTH_CONFIG, AUTH_ACCOUNT_STORE],
      useFactory: (config: AuthConfig, store: AuthAccountStore) => new AuthService(config, store),
    },
    AuthContextMiddleware,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AuthContextMiddleware],
})
export class AuthModule {}
