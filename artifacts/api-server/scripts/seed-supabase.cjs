const path = require("path");
const Module = require("module");

const extraPaths = [
  path.resolve(__dirname, "../node_modules"),
  path.resolve(__dirname, "../../../node_modules"),
  path.resolve(__dirname, "../../../lib/db/node_modules"),
];
process.env.NODE_PATH = [process.env.NODE_PATH, ...extraPaths]
  .filter(Boolean)
  .join(":");
Module._initPaths();

const pg = require("pg");
const bcrypt = require("bcryptjs");

(async () => {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("SUPABASE_DB_URL or DATABASE_URL required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        username text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    console.log("users table OK");

    const u = process.env.APP_USERNAME;
    const p = process.env.APP_PASSWORD;
    if (u && p) {
      const hash = await bcrypt.hash(p, 10);
      const r = await pool.query(
        `INSERT INTO users (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
         RETURNING id, username`,
        [u, hash],
      );
      console.log("upserted:", r.rows[0]);
    } else {
      console.log("No APP_USERNAME/APP_PASSWORD; skipping upsert");
    }

    const list = await pool.query("SELECT id, username FROM users");
    console.log("all users:", list.rows);
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
