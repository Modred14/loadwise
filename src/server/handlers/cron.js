// Scheduled jobs. Protected by CRON_SECRET (Authorization: Bearer ...). Call from GitHub Actions / Vercel Cron / any scheduler.
import crypto from "node:crypto";
import { route } from "../router.js";
import { HttpError } from "../http.js";
import { dispatchReminders, enqueueReminders, housekeeping } from "../reminders.js";
import { recordSnapshot } from "../workload.js";

function requireSecret(ctx) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "CRON_NOT_CONFIGURED", "Scheduled jobs are not configured (CRON_SECRET is missing).");
  const given = (ctx.req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(given).digest(), b = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, "UNAUTHENTICATED", "Invalid credentials.");
}

const reminders = async (ctx) => {
  requireSecret(ctx);
  const enqueued = await enqueueReminders(ctx.db);
  const dispatched = await dispatchReminders(ctx.db);
  return { enqueued, dispatched };
};
route("GET", "/cron/reminders", reminders, { auth: false });
route("POST", "/cron/reminders", reminders, { auth: false });

const snapshots = async (ctx) => {
  requireSecret(ctx);
  const { rows } = await ctx.db.query("select distinct user_id as id from tasks where status <> 'completed' limit 20000");
  let ok = 0, failed = 0;
  for (const u of rows) { try { await recordSnapshot(ctx.db, u.id); ok++; } catch { failed++; } }
  await housekeeping(ctx.db);
  return { users: rows.length, ok, failed };
};
route("GET", "/cron/snapshots", snapshots, { auth: false });
route("POST", "/cron/snapshots", snapshots, { auth: false });
