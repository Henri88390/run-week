import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/features/account/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { GarminConfig } from "./config";
import { GarminApiError } from "./diagnostics";
import type { GarminTokens } from "./garmin-api";
import { isGarminTokens, seal, unseal } from "./session";
import { GARMIN_CONSENT_VERSION } from "../privacy";

/** Tokens of a usable connection, or null when none exists, it expired or predates the current consent. */
export async function loadTokens(config: GarminConfig, userId: string): Promise<GarminTokens | null> {
  const connection = await db().garminConnection.findUnique({ where: { userId } });
  if (!connection || connection.consentVersion !== GARMIN_CONSENT_VERSION) return null;
  const tokens = unseal(connection.tokens, config.sessionSecret);
  return isGarminTokens(tokens) && tokens.refreshExpiresAt > Date.now() ? tokens : null;
}

export async function saveConnection(
  config: GarminConfig, userId: string, garminUserId: string, tokens: GarminTokens,
  consent: { version: string; at: Date },
): Promise<void> {
  const sealed = seal(tokens, config.sessionSecret);
  const garminUserKey = garminAccountKey(config, garminUserId);
  const data = { garminUserKey, tokens: sealed, consentVersion: consent.version, consentAt: consent.at };
  try {
    await db().$transaction(async (tx) => {
      const owner = await tx.garminConnection.findUnique({ where: { garminUserKey }, select: { userId: true } });
      if (owner && owner.userId !== userId) throw new GarminApiError("already_linked");
      const previous = await tx.garminConnection.findUnique({ where: { userId }, select: { garminUserKey: true } });
      // Records of another Garmin account cannot be deleted with these tokens.
      if (previous && previous.garminUserKey !== garminUserKey) {
        await tx.garminWorkout.deleteMany({ where: { userId } });
      }
      await tx.garminConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    });
  } catch (error) {
    // A concurrent connection of the same Garmin account by another user.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GarminApiError("already_linked");
    }
    throw error;
  }
}

/** Pseudonymous, keyed so the database never holds the Garmin user ID. */
function garminAccountKey(config: GarminConfig, garminUserId: string): string {
  return createHmac("sha256", config.sessionSecret).update("run-week:garmin:user:v1\0").update(garminUserId).digest("hex");
}

export async function updateTokens(config: GarminConfig, userId: string, tokens: GarminTokens): Promise<void> {
  await db().garminConnection.updateMany({ where: { userId }, data: { tokens: seal(tokens, config.sessionSecret) } });
}

/** Forgets the tokens only; sent-workout records stay so a reconnect can still remove them. */
export async function forgetTokens(userId: string): Promise<void> {
  await db().garminConnection.deleteMany({ where: { userId } });
}

/** Removes the connection and every sent-workout record. */
export async function deleteConnection(userId: string): Promise<void> {
  await db().$transaction([
    db().garminConnection.deleteMany({ where: { userId } }),
    db().garminWorkout.deleteMany({ where: { userId } }),
  ]);
}

export type SentWorkout = { date: string; workoutId: number };

function toSent(row: { date: string; workoutId: bigint }): SentWorkout {
  return { date: row.date, workoutId: Number(row.workoutId) };
}

export async function sentWorkouts(userId: string, dates: string[]): Promise<SentWorkout[]> {
  const rows = await db().garminWorkout.findMany({
    where: { userId, date: { in: dates } },
    select: { date: true, workoutId: true },
    orderBy: { date: "asc" },
  });
  return rows.map(toSent);
}

/**
 * Records a sent workout. Returns the workout already recorded for that day when another request
 * recorded one first, so the caller can remove its duplicate from Garmin.
 */
export async function recordWorkout(userId: string, date: string, workoutId: number): Promise<SentWorkout | null> {
  const { count } = await db().garminWorkout.createMany({
    data: [{ userId, date, workoutId: BigInt(workoutId) }],
    skipDuplicates: true,
  });
  if (count === 1) return null;
  const existing = await db().garminWorkout.findUnique({
    where: { userId_date: { userId, date } },
    select: { date: true, workoutId: true },
  });
  if (!existing) throw new Error("Workout record conflict without a stored workout.");
  return toSent(existing);
}

export async function forgetWorkout(userId: string, date: string): Promise<void> {
  await db().garminWorkout.deleteMany({ where: { userId, date } });
}
