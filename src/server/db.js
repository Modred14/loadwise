import pg from "pg";
import { HttpError } from "./http.js";

// Keep dates/times as the plain local strings the frontend expects (never shifted through UTC).
pg.types.setTypeParser(1082, (v) => v); // date -> YYYY-MM-DD
pg.types.setTypeParser(1083, (v) => v.slice(0, 5)); // time -> HH:mm
pg.types.setTypeParser(1114, (v) => v.replace(" ", "T").slice(0, 16)); // timestamp -> YYYY-MM-DDTHH:mm
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint

function wrap(pool) {
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: (t, p) => client.query(t, p) });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

const g = globalThis;
/** Returns the shared db handle. Tests can pass their own via handle(req, { db }). */
export function getDb() {
  if (!g.__loadwiseDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new HttpError(503, "DB_NOT_CONFIGURED", "The database is not configured.");
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5), idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
    pool.on("error", () => {});
    g.__loadwiseDb = wrap(pool);
  }
  return g.__loadwiseDb;
}

export { wrap as wrapPool };
