import { execFileSync } from "node:child_process";
import pg from "pg";
import { DATABASE_URL, DB_CONTAINER, DB_IMAGE, DB_PORT } from "./env";

function docker(args: string[]): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`docker ${args[0]} failed${stderr ? `: ${stderr}` : ""}. Is Docker running?`);
  }
}

/** Removes the e2e database container; succeeds when it does not exist. */
export function removeDatabase() {
  try {
    execFileSync("docker", ["rm", "--force", "--volumes", DB_CONTAINER], { stdio: "ignore" });
  } catch {
    // The container did not exist.
  }
}

async function waitForDatabase(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = new pg.Client(DATABASE_URL);
    try {
      await client.connect();
      await client.query("SELECT 1");
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`The e2e database did not start: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await client.end().catch(() => {});
    }
  }
}

/** Starts a new PostgreSQL container with in-memory storage and applies the migrations. */
export async function createDatabase() {
  removeDatabase();
  docker([
    "run", "--detach", "--rm",
    "--name", DB_CONTAINER,
    "--publish", `127.0.0.1:${DB_PORT}:5432`,
    "--tmpfs", "/var/lib/postgresql/data",
    "--env", "POSTGRES_USER=run_week",
    "--env", "POSTGRES_PASSWORD=run_week",
    "--env", "POSTGRES_DB=run_week_e2e",
    DB_IMAGE,
  ]);
  try {
    await waitForDatabase();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL },
      stdio: "inherit",
    });
  } catch (error) {
    removeDatabase();
    throw error;
  }
}
