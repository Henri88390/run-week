import { createDatabase } from "./database";

/** Creates a new e2e database container and applies the migrations. */
export default async function globalSetup() {
  await createDatabase();
}
