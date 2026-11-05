import "server-only";
import { createHmac } from "node:crypto";

export function athleteKey(encryptionKey: string, id: number) {
  return createHmac("sha256", encryptionKey).update(`run-week:strava:athlete:v1\0${id}`).digest("hex");
}
