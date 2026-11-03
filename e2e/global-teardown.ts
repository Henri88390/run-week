import { removeDatabase } from "./database";

/** Removes the e2e database container and all test accounts with it, whether tests passed or failed. */
export default async function globalTeardown() {
  removeDatabase();
}
