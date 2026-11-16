// Applies drizzle migrations. Runs before `next build`; skipped when DATABASE_URL is absent.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set, skipping migrations");
  process.exit(0);
}
// sslmode in the URL configures TLS itself; otherwise force TLS for Neon hosts.
const forceSsl = /neon\.tech/.test(url) && !/sslmode=/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: forceSsl ? true : undefined });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("[migrate] migrations applied");
} finally {
  await pool.end();
}
