import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdminGuard } from "./admin.guard";
import { requestContext } from "./request-context";

const as = (role: "admin" | "user" | null) => (run: () => unknown) =>
  requestContext.run({ user: role ? { id: "u1", email: "a@b.c", role } : null }, run);

describe("AdminGuard", () => {
  const guard = new AdminGuard();

  it("lets an admin through", () => {
    expect(as("admin")(() => guard.canActivate())).toBe(true);
  });

  it("refuses a user, and anyone signed out", () => {
    expect(() => as("user")(() => guard.canActivate())).toThrow(ForbiddenException);
    expect(() => as(null)(() => guard.canActivate())).toThrow(UnauthorizedException);
  });
});
