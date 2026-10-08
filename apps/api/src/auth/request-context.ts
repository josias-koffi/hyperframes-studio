import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedException } from "@nestjs/common";
import type { SessionUser } from "./auth.types";

type RequestContext = { user: SessionUser | null };

/**
 * The signed-in person of the request being served, set by `AuthContextMiddleware` around the whole request.
 * Services read it where they look rows up (`ownerId`), so every route that goes through them is scoped to its
 * owner without each signature carrying the user.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The signed-in person; outside a signed-in request it refuses rather than read unscoped. */
export function currentUser(): SessionUser {
  const user = requestContext.getStore()?.user;
  if (!user) throw new UnauthorizedException("Connecte-toi pour continuer.");
  return user;
}

export function currentUserId() {
  return currentUser().id;
}
