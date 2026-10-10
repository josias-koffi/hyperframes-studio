import { ForbiddenException, Injectable, type CanActivate } from "@nestjs/common";
import { currentUser } from "./request-context";

/** Admin-only routes (`@UseGuards(AdminGuard)`): the global `AuthGuard` has already required a session. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate() {
    if (currentUser().role === "admin") return true;
    throw new ForbiddenException("Réservé aux administrateurs.");
  }
}
