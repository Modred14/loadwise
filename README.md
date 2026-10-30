# LoadWise

Academic load tracker, early-warning system and study planner (Next.js 16, React 19, Tailwind 4, JavaScript).

LoadWise is a Next.js app with its API built in (PostgreSQL / Neon). See `docs/BACKEND.md`. See `docs/API_CONTRACT.md` for the endpoints, shapes and access rules the frontend expects. Without a backend URL the app shows "Backend not connected" and displays no data; it never fabricates any.

## Setup
```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL
npm run dev
```

## Scripts
- `npm run dev` / `npm run build` / `npm start`
- `npm run lint`
- `npm test`: unit tests for the workload, warning and planner engines and the calendar export

## Features beyond the core MVP
- **Calendar reminders:** `Add to calendar (.ics)` on the Calendar page (open deadlines, with a 1-day reminder and a 2-hour reminder for timed exams/tests) and on the Planner page (planned study sessions, 10-minute reminder). Times are local wall-clock times.
- **Study plan as PDF:** Planner > `Print / Save as PDF` uses the browser print dialog with a print-specific layout (navigation and buttons hidden). It prints the week currently shown.
- **PWA:** web app manifest, icons, and a service worker (production only) that caches static assets only and shows an offline page. It never caches API responses or signed-in pages.

## Not built yet (needs backend support)
Study material uploads and search, linking materials to sessions, course-rep updates to shared test/exam dates, departmental insights, server-sent email/push reminders, and workload trends over time (no history is stored). Dark mode is intentionally not included yet.

## Structure
- `src/lib/engine`: pure, deterministic workload score, early-warning rules and study-plan scheduler. Documented in `docs/WORKLOAD_ENGINE.md`.
- `src/lib/api/client.js`: the only place the frontend calls the backend.
- `src/lib/auth.js`, `src/lib/store.js`: session and data state.
- `src/components`: design system (`ui.js`), forms and shared pieces (`domain.js`), app shell.
- `src/app`: landing, login/register, and the authenticated app (`(app)`): dashboard, courses, tasks, calendar, planner, insights, notifications, settings.

## Security note
The route guard in the frontend is for user experience only. The backend must authenticate every request and scope all data to the signed-in user.


## Backend quick start
```bash
cp .env.example .env.local      # set DATABASE_URL (Neon pooled string)
npm run db:migrate
npm run dev
npm test                        # engine + UI unit tests
TEST_DATABASE_URL=postgres://user:pw@localhost/postgres npm run test:server   # API integration tests (creates throwaway databases)
```
Full details, security model and limitations: `docs/BACKEND.md`.
