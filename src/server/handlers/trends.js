import { route } from "../router.js";
import { clampInt, rateLimit } from "../http.js";
import { recordSnapshot } from "../workload.js";

// The server recomputes the score from stored data (it never trusts a client-supplied score).
route("POST", "/workload/snapshot", async (ctx) => {
  await rateLimit(ctx.db, `snapshot:${ctx.user.id}`, 60, 3600);
  return recordSnapshot(ctx.db, ctx.user.id);
});

route("GET", "/workload/trend", async (ctx) => {
  const days = clampInt(ctx.query.days, 60, 7, 365);
  const { rows } = await ctx.db.query(
    `select day, score, category, active_tasks as "activeTasks", overdue_tasks as "overdueTasks", remaining_hours as "remainingHours", capacity_hours as "capacityHours"
       from workload_snapshots where user_id = $1 and day >= current_date - $2::int order by day`, [ctx.user.id, days]);
  const last = rows[rows.length - 1];
  const weekAgo = [...rows].reverse().find((r) => r.day <= new Date(Date.parse(`${last?.day}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10));
  return { items: rows, summary: last ? { latest: last.score, average: Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length), peak: Math.max(...rows.map((r) => r.score)), changeVs7DaysAgo: weekAgo ? last.score - weekAgo.score : null } : null };
});
