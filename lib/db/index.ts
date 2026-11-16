import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzlePg<typeof schema>>;

let instance: Db | undefined;

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Neon's HTTP driver is the cheapest option on serverless; plain TCP elsewhere (local dev, CI).
  if (/\.neon\.tech/.test(url)) {
    return drizzleNeon(neon(url), { schema }) as unknown as Db;
  }
  const pool = new Pool({ connectionString: url, max: 5 });
  return drizzlePg(pool, { schema });
}

/** Lazily created so `next build` works without a database. */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= create();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
