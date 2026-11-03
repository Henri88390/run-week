import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { runWeekPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazily created so builds and pages that never touch the database do not require DATABASE_URL. */
export function db(): PrismaClient {
  globalForPrisma.runWeekPrisma ??= createClient();
  return globalForPrisma.runWeekPrisma;
}
