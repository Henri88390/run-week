import "server-only";
import { db } from "@/features/account/server/db";
import type { GarminConfig } from "./config";
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
  config: GarminConfig, userId: string, tokens: GarminTokens, consent: { version: string; at: Date },
): Promise<void> {
  const sealed = seal(tokens, config.sessionSecret);
  await db().garminConnection.upsert({
    where: { userId },
    create: { userId, tokens: sealed, consentVersion: consent.version, consentAt: consent.at },
    update: { tokens: sealed, consentVersion: consent.version, consentAt: consent.at },
  });
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
