import { Inject, Injectable, SetMetadata, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { requestContext } from "./request-context";

const IS_PUBLIC = "auth:public";

/** A route (or a whole controller) open without a session: health checks, the sign-in itself. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Every route needs a signed-in person unless marked `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    if (requestContext.getStore()?.user) return true;
    throw new UnauthorizedException("Connecte-toi pour continuer.");
  }
}
