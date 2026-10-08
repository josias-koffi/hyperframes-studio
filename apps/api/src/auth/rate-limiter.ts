/**
 * Fixed-window counters in memory: enough for one API instance to keep a script from turning the sign-in form into
 * a mail cannon. Restarting the API resets them.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Counts one hit for `key`; false once the key went over its limit in the current window. */
  hit(key: string, now = Date.now()) {
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      if (this.windows.size > 10_000) this.sweep(now);
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }

  private sweep(now: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
