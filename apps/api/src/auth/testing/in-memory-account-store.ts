import { randomUUID } from "node:crypto";
import type { AuthAccount, AuthAccountStore } from "../auth.types";

/** The Postgres store's behaviour, in memory, for the tests. */
export class InMemoryAccountStore implements AuthAccountStore {
  readonly accounts = new Map<string, AuthAccount>();

  async findById(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async findOrCreate(email: string) {
    const existing = [...this.accounts.values()].find((account) => account.email === email);
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
}
