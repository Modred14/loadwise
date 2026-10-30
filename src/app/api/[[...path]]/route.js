// Single entry point for the whole backend: every /api/* request is handed to the router in src/server.
// Importing routes.js registers all handlers (auth, courses, tasks, cron, ...).
import { handle } from "@/server/routes.js";

const run = (req) => handle(req);

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;