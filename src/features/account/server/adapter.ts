import "server-only";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { User } from "@/generated/prisma/client";
import { db } from "./db";
import { clearFailedCodes, recordFailedCode } from "./sign-in-limits";

function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
  };
}

function userData(user: Partial<AdapterUser>) {
  return {
    ...(user.email !== undefined ? { email: user.email } : {}),
    ...(user.emailVerified !== undefined ? { emailVerified: user.emailVerified } : {}),
    ...(user.name !== undefined ? { name: user.name } : {}),
    ...(user.image !== undefined ? { image: user.image } : {}),
  };
}

/**
 * Auth.js adapter for the Prisma schema. Stores only the provider identity for linked accounts
 * (no provider tokens) and invalidates email codes after repeated wrong entries.
 */
export function accountAdapter(): Adapter {
  return {
    async createUser(user) {
      return toAdapterUser(await db().user.create({ data: userData(user) }));
    },
    async getUser(id) {
      const user = await db().user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await db().user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await db().account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },
    async updateUser({ id, ...user }) {
      return toAdapterUser(await db().user.update({ where: { id }, data: userData(user) }));
    },
    async deleteUser(id) {
      await db().user.deleteMany({ where: { id } });
    },
    async linkAccount({ userId, type, provider, providerAccountId }) {
      await db().account.create({ data: { userId, type, provider, providerAccountId } });
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await db().account.deleteMany({ where: { provider, providerAccountId } });
    },
    async createSession(session) {
      return db().session.create({
        data: { sessionToken: session.sessionToken, userId: session.userId, expires: session.expires },
        select: { sessionToken: true, userId: true, expires: true },
      });
    },
    async getSessionAndUser(sessionToken) {
      const session = await db().session.findUnique({ where: { sessionToken }, include: { user: true } });
      if (!session) return null;
      return {
        session: { sessionToken: session.sessionToken, userId: session.userId, expires: session.expires },
        user: toAdapterUser(session.user),
      };
    },
    async updateSession({ sessionToken, expires }) {
      if (!expires) return null;
      const { count } = await db().session.updateMany({ where: { sessionToken }, data: { expires } });
      if (count === 0) return null;
      return db().session.findUnique({
        where: { sessionToken },
        select: { sessionToken: true, userId: true, expires: true },
      });
    },
    async deleteSession(sessionToken) {
      await db().session.deleteMany({ where: { sessionToken } });
    },
    async createVerificationToken(token) {
      // Only the latest code is valid for an email.
      await db().$transaction([
        db().verificationToken.deleteMany({ where: { identifier: token.identifier } }),
        db().verificationToken.create({ data: token }),
      ]);
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      if (!identifier) return null;
      const found = await db().verificationToken.findUnique({ where: { identifier_token: { identifier, token } } });
      const { count } = found
        ? await db().verificationToken.deleteMany({ where: { identifier, token } })
        : { count: 0 };
      if (!found || count === 0) {
        await recordFailedCode(identifier);
        return null;
      }
      await clearFailedCodes(identifier);
      return found;
    },
  };
}

