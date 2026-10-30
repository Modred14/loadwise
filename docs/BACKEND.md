# LoadWise backend (PostgreSQL / Neon)

The API ships inside the Next.js app as route handlers at `/api/*` (`src/app/api/[[...path]]/route.js`), so one deployment serves frontend and backend and cookies are same-origin. All logic lives in `src/server`; the API is a plain function `handle(Request) -> Response`, which is how it is tested.

## Set up on Neon
1. Create a Neon project. Copy the **pooled** connection string into `DATABASE_URL`.
2. `npm run db:migrate` applies `db/migrations/*.sql` in order, once each, in transactions. It never drops or truncates anything and is safe to re-run. Run it against a Neon *branch* first if you want to rehearse.
3. Set the other variables from `.env.example`. Only `DATABASE_URL` is required; email, push and cron are optional and the app states plainly when they are off.
4. Make the first administrator: register normally, then `npm run admin:grant -- you@school.edu "Department of Computer Science"` (creates the department if needed). Admins then add department courses and course reps in the app.

## What it provides
| Area | Endpoints | Notes |
|---|---|---|
| Auth | `/auth/register, login, logout, logout-all, me, change-password, forgot, reset` | scrypt hashing; random 256-bit session tokens stored only as SHA-256; HttpOnly SameSite=Lax cookie (Secure on HTTPS); 30-day sessions |
| Core | `/preferences, /courses (+/ranking), /tasks, /study-sessions (+/plan), /warnings (+/sync)` | Everything scoped to the signed-in user in SQL; another user's id returns 404 |
| Shared dates | `/catalog, /catalog/:id/reps, /shared-deadlines` | Rep adds a date, linked students get a task and a notification; reschedules sync; students keep their own prep hours/importance |
| Materials | `/materials (+/usage, /:id/file, /:id/tasks)` | Verified uploads, full-text search, task links |
| Department | `/department/insights` | Admin only, k-anonymised |
| Trends | `/workload/snapshot, /workload/trend` | Server recomputes the score; one row per day |
| Reminders | `/push/*, /reminders/status, /reminders/test, /cron/*` | Outbox with dedupe, retries, real email + Web Push |
| Account | `/account/export, DELETE /account` | Full export; deletion cascades |

## Security model
- **Authorisation:** every query filters by `user_id` from the session, never from the request. 40 integration tests (real PostgreSQL) include cross-user attempts on every resource.
- **CSRF:** state-changing requests must be same-origin (`Origin` / `Sec-Fetch-Site` check) on top of SameSite=Lax; JSON endpoints also require `application/json`.
- **Rate limits** (Postgres-backed, so they hold across serverless instances): login, registration, forgot/reset, uploads, plan saves, test sends, exports, deletions.
- **Uploads:** 4 MB per file, 50 MB / 500 files per user. Type comes from the file's bytes plus extension (a renamed `.exe` is refused), filenames are sanitised, downloads are `attachment` with `nosniff` and `CSP: sandbox`; only PDFs and images can open inline.
- **Errors:** raw database errors and stack traces never reach the client.
- **Secrets** are read from the environment only and never sent to the browser (the VAPID *public* key is public by design).
- **Cron endpoints** require `CRON_SECRET` (constant-time compare) and return 503 when it is unset, so they are never open by default.

## Departmental privacy
Insights are aggregates only. Any group under `DEPT_MIN_COHORT` (default 5) is hidden, and hidden cells are suppressed together with their complements so they cannot be recovered by subtraction. Clash analysis uses only official shared deadlines. The tests assert that no name, email or task title appears in the response.

## Reminders
`/api/cron/reminders` (call every ~10 min; see `.github/workflows/scheduled-jobs.yml`) enqueues reminders, then sends what is due. A reminder is queued once per (user, channel, deadline, lead time); rescheduling or completing a task cancels the stale one; failures retry up to 5 times with a lease so parallel runs never double-send. Deadlines use the student's own time zone. A task without a time is reminded relative to 09:00 that day. If email/push is not configured the reminder is marked `skipped` with the reason and **never** `sent`.
Push needs `npm run vapid:generate` and HTTPS; the browser subscribes from Settings.

## Limitations and decisions to review
- **File storage is in Postgres** (`bytea`) to keep the stack to Neon only. That is fine for notes and slides at this size; for large media, swap `material_blobs` for object storage (the handlers isolate this in one table).
- **Search** extracts text from PDF, TXT and Markdown only. Scanned PDFs, images, DOCX and PPTX are stored and found by title, tags and notes, and the UI says "not searchable inside".
- **No virus scanning** of uploads.
- **Email verification** is not implemented: anyone can register with any address. Password reset only reaches the real mailbox owner.
- **Roles:** `student` and `dept_admin`; course reps are per-course assignments. Admins are created by script, not in the UI.
- **Large departments:** insights load a department's data in bulk (capped at 5,000 users); precompute if you outgrow that.
- Reminders at 5 minute resolution depend on your scheduler; GitHub Actions cron can run a few minutes late.
