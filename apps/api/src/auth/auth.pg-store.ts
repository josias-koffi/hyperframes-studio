import { authMagicLinks, users, type Database } from "@studio/db";
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import type { AuthAccount, AuthAccountStore } from "./auth.types";

/** Serializes account creation, so two first sign-ins at once cannot both become the first admin. */
const ACCOUNT_CREATION_LOCK = 742_913;

function toAccount(row: typeof users.$inferSelect): AuthAccount {
  return { id: row.id, email: row.email, role: row.role, status: row.status, sessionsValidFrom: row.sessionsValidFrom };
}

export function createPgAuthAccountStore(db: Database): AuthAccountStore {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email));
      return row ? toAccount(row) : null;
    },

    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row ? toAccount(row) : null;
    },

    findOrCreate(email, consent) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${ACCOUNT_CREATION_LOCK})`);
        const [existing] = await tx.select().from(users).where(eq(users.email, email));
        if (existing) return toAccount(existing);
        const [{ total }] = await tx.select({ total: count() }).from(users);
        const [row] = await tx
          .insert(users)
          .values({ email, consent, role: total === 0 ? "admin" : "user" })
          .returning();
        return toAccount(row);
      });
    },

    async saveMagicLink(tokenHash, link) {
      await db.insert(authMagicLinks).values({ tokenHash, ...link });
    },

    async consumeMagicLink(tokenHash, now) {
      const [row] = await db
        .delete(authMagicLinks)
        .where(and(eq(authMagicLinks.tokenHash, tokenHash), gt(authMagicLinks.expiresAt, now)))
        .returning();
      return row ? { email: row.email, consent: row.consent, expiresAt: row.expiresAt } : null;
    },

    async purgeExpiredMagicLinks(now) {
      const rows = await db.delete(authMagicLinks).where(lte(authMagicLinks.expiresAt, now)).returning({ tokenHash: authMagicLinks.tokenHash });
      return rows.length;
    },
  };
}
