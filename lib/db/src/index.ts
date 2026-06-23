import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const connectionString =
      process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not configured. Provision a PostgreSQL database in Replit.",
      );
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export * from "./schema";
