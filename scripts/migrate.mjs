// Applies db/migrations/*.sql in order, once each, inside a transaction per file.
// Usage: DATABASE_URL=postgres://... npm run db:migrate
// Never drops or truncates anything. Safe to re-run.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export async function migrate(connectionString, { log = console.log } = {}) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(path.join(dir, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [f]);
        await client.query("commit");
        log(`applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
    log("migrations up to date");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL (your Neon connection string)."); process.exit(1); }
  migrate(process.env.DATABASE_URL).catch((e) => { console.error(e.message); process.exit(1); });
}
