import "server-only";
import { db } from "@/features/account/server/db";
import { bestSections, insertRankedSection, PERFORMANCE_DISTANCES } from "../best-sections";
import { bestSectionsSchema, STRAVA_CONSENT_VERSION, streamSchema, type BestSectionsData } from "../types";
import { StravaError } from "./api";
import { readActivityCache, writeActivityCache } from "./cache";

/** Computes all-time rankings from this account's imported, recorded streams. */
export async function accountBestSections(userId: string): Promise<BestSectionsData> {
  if (!userId) throw new StravaError("unauthorized", 401);
  const linked = await db().stravaConnection.findUnique({ where: { userId }, select: { consentVersion: true } });
  if (linked?.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
  const field = "dashboard:best-sections:v1";
  const cached = await readActivityCache(userId, field, bestSectionsSchema);
  if (cached) return cached;
  const data: BestSectionsData = {
    distances: PERFORMANCE_DISTANCES.map((meters) => ({ meters, results: [] })),
  };
  // No calendar predicates or activity limit. Bound memory while scanning stored,
  // non-GPS streams; never make upstream API calls on a dashboard read.
  let cursor: string | undefined;
  for (;;) {
    const rows = await db().stravaActivity.findMany({
      where: { userId }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, name: true, localDate: true, streams: true },
    });
    for (const row of rows) {
      const parsed = streamSchema.safeParse(row.streams);
      const sections = bestSections(parsed.success ? parsed.data : null);
      sections.efforts.forEach((effort, i) => {
        if (effort) insertRankedSection(data.distances[i].results, {
          ...effort, activityId: row.id, name: row.name, localDate: row.localDate,
        });
      });
    }
    if (rows.length < 100) break;
    cursor = rows.at(-1)?.id;
  }
  await writeActivityCache(userId, field, data);
  return data;
}

/** Serialize the full-history scan with Strava sync, disconnect and reconnect writes. */
export async function cachedBestSections(userId: string): Promise<BestSectionsData> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
    return accountBestSections(userId);
  }, { timeout: 10_000 });
}
