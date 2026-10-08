import { randomUUID } from "node:crypto";
import type { AuthAccount, AuthAccountStore, AuthMagicLink } from "../auth.types";

/** The Postgres store's behaviour, in memory, for the tests. */
export class InMemoryAccountStore implements AuthAccountStore {
  readonly accounts = new Map<string, AuthAccount>();
  readonly links = new Map<string, AuthMagicLink>();

  async findByEmail(email: string) {
    return [...this.accounts.values()].find((account) => account.email === email) ?? null;
  }

  async findById(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async findOrCreate(email: string) {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    const account: AuthAccount = {
      id: randomUUID(),
      email,
      role: this.accounts.size === 0 ? "admin" : "user",
      status: "active",
      sessionsValidFrom: null,
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async saveMagicLink(tokenHash: string, link: AuthMagicLink) {
    this.links.set(tokenHash, link);
  }

  async consumeMagicLink(tokenHash: string, now: Date) {
    const link = this.links.get(tokenHash);
    if (!link || link.expiresAt <= now) return null;
    this.links.delete(tokenHash);
    return link;
  }

  async purgeExpiredMagicLinks(now: Date) {
    let removed = 0;
    for (const [hash, link] of this.links) {
      if (link.expiresAt <= now) {
        this.links.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }
}
