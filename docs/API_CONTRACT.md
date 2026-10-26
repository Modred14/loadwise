# LoadWise API contract (frontend to backend)

For the backend engineer (Replit). The frontend needs these resources; shapes below are what the engine and UI consume. Anything marked *proposed* can be changed, but tell the frontend so `src/lib/api` stays in sync.

## Global rules
- JSON over HTTPS under one base URL (`NEXT_PUBLIC_API_BASE_URL`).
- **Every route except register/login requires an authenticated user, and every query is scoped to that user on the server.** Requesting another user's id returns `404` (not `403`, to avoid leaking existence). Never trust a `userId` from the request body.
- Dates: `dueDate` is `YYYY-MM-DD`, times are `HH:mm`, both local to the student. Timestamps (`createdAt`, `updatedAt`) are ISO-8601 UTC. Store `dueDate`/`dueTime` as plain strings or DATE/TIME columns, **not** as UTC timestamps, so deadlines never shift by a day.
- Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "title": "Required" } } }` with proper status codes (400, 401, 404, 409, 429). No stack traces or SQL errors in responses.
- List endpoints accept `?limit=&cursor=`; responses `{ "items": [...], "nextCursor": null }`.
- Updates must be safe under concurrent edits: send and check `updatedAt` (or `version`) and return `409` when stale.
- Rate-limit login/register and any bulk or generation endpoint.
- Auth mechanism *to be confirmed*: HttpOnly Secure SameSite cookie session preferred (add CSRF protection if cross-site), or bearer tokens. Tell the frontend which.

## Resources

### Auth
`POST /auth/register {name,email,password}` · `POST /auth/login {email,password}` · `POST /auth/logout` · `GET /auth/me`

### Preferences (one per user)
`GET /preferences` · `PUT /preferences`
```json
{ "dailyStudyHours": 3, "availableDays": [1,2,3,4,5], "maxSessionMinutes": 90,
  "breakMinutes": 10, "preferredStartTime": "18:00", "timezone": "Africa/Lagos" }
```
Missing values fall back to the defaults in `src/lib/engine/config.js`.

### Courses
`GET /courses` · `POST /courses` · `PATCH /courses/:id` · `DELETE /courses/:id`
```json
{ "id": "", "code": "CS201", "name": "Algorithms & Complexity", "priority": 3,
  "color": null, "createdAt": "", "updatedAt": "" }
```
Unique per user on `code` (case-insensitive); `409` on duplicate. `DELETE` must not silently orphan data: either reject with `409` while tasks exist, or accept `?cascade=true` and delete tasks and sessions in a transaction. The UI will confirm first.

### Tasks
`GET /tasks?courseId=&type=&status=&from=&to=&q=` · `POST /tasks` · `PATCH /tasks/:id` · `DELETE /tasks/:id`
```json
{ "id": "", "courseId": "", "title": "", "description": "",
  "type": "test|assignment|continuous_assessment|exam|project|other",
  "dueDate": "2026-10-28", "dueTime": "10:00", "estimatedHours": 4,
  "importance": 3, "status": "todo|in_progress|completed",
  "completedAt": null, "studiedHours": 0, "createdAt": "", "updatedAt": "" }
```
`studiedHours` is the sum of the task's completed study session hours (computed by the server, read-only). Completing a task sets `completedAt`. `courseId` must belong to the same user.

### Study sessions
`GET /study-sessions?from=&to=&taskId=` · `PATCH /study-sessions/:id` (status, move/adjust) · `DELETE /study-sessions/:id`
`PUT /study-sessions/plan` (*proposed*): atomically replaces all non-completed sessions with the supplied list, in one transaction, leaving `completed` ones untouched. The frontend generates the plan with the engine and sends it.
```json
{ "id": "", "taskId": "", "courseId": "", "date": "2026-10-26",
  "startsAt": "2026-10-26T18:00", "endsAt": "2026-10-26T19:30", "minutes": 90,
  "status": "planned|completed|skipped", "reason": "", "completedAt": null }
```
Server-side checks: `taskId` is the user's, `minutes > 0`, `startsAt < endsAt`.
When a task's `dueDate`, `dueTime` or `estimatedHours` changes, the response (or a header) should flag that non-completed sessions for it are stale so the UI can offer to regenerate.

### Warnings / notifications
`GET /warnings?status=active` · `POST /warnings/sync` · `POST /warnings/:id/dismiss` · `POST /warnings/:id/read`
`POST /warnings/sync` takes the output of `reconcileWarnings()` (`{toCreate,toUpdate,toResolve}`) and applies it in a transaction. Unique on `(userId, key)`. Warning shape:
```json
{ "id": "", "key": "overdue:task-id", "code": "OVERDUE_TASK", "severity": "info|warning|critical",
  "title": "", "why": "", "courseId": null, "taskIds": [], "actionBy": "2026-10-25T09:00",
  "nextStep": "", "status": "active|dismissed|resolved", "dismissedSeverity": null,
  "readAt": null, "createdAt": "", "updatedAt": "" }
```
If email/push delivery is wanted later, it must be sent from the backend with provider keys kept server-side. Until it exists, the UI will not claim anything was emailed.

## Open questions for the backend
1. Cookie session or bearer token? Allowed origins for CORS?
2. Is `PUT /study-sessions/plan` acceptable, or do you prefer individual creates?
3. Do you want to run the engine server-side later (for notifications)? It is plain JS with no dependencies and can be copied or imported as is.
4. Out of MVP scope for now (not building UI until the API exists): study material uploads, course-rep shared dates, departmental insights, PDF export.
