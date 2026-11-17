import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;
/** A transaction handle; every query helper accepts either `db` or a `tx`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

let instance: Db | undefined;

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (/\.neon\.tech/.test(url)) {
    // Neon over WebSockets: unlike the HTTP driver it supports interactive transactions
    // (SELECT … FOR UPDATE), which serialize concurrent actions on the same game.
    if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket === "function") {
      neonConfig.webSocketConstructor = globalThis.WebSocket;
    }
    const pool = new NeonPool({ connectionString: url, max: 5, idleTimeoutMillis: 20_000 });
    pool.on("error", (e: Error) => console.error("[db] pool error", e));
    return drizzleNeon(pool, { schema }) as unknown as Db;
  }
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on("error", (e) => console.error("[db] pool error", e));
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
