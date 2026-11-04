// Safe schema-only commands: deliberately does not load .env or select a database.
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "../prisma/schema.prisma",
  migrations: { path: "../prisma/migrations" },
});
