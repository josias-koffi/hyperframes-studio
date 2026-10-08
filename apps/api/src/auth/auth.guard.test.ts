import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { AuthGuard, Public } from "./auth.guard";
import { requestContext } from "./request-context";

class Open {
  @Public()
  handler() {}
}

class Closed {
  handler() {}
}

function contextOf(target: { prototype: { handler: () => void } }) {
  return { getHandler: () => target.prototype.handler, getClass: () => target } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  const guard = new AuthGuard(new Reflector());

  it("lets public routes through without a session", () => {
    expect(requestContext.run({ user: null }, () => guard.canActivate(contextOf(Open)))).toBe(true);
  });

  it("requires a signed-in person everywhere else", () => {
    expect(() => requestContext.run({ user: null }, () => guard.canActivate(contextOf(Closed)))).toThrow("Connecte-toi");
    const user = { id: "u1", email: "ada@example.com", role: "user" as const };
    expect(requestContext.run({ user }, () => guard.canActivate(contextOf(Closed)))).toBe(true);
  });
});
