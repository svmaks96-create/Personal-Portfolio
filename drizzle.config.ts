import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  dbCredentials: {
    url: "data/portfolio.db",
  },
});
