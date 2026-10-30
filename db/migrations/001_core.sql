-- LoadWise core schema. Plain SQL, applied in order by scripts/migrate.mjs.
create extension if not exists pgcrypto;

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create unique index departments_name_uq on departments (lower(name));

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) <= 254),
  password_hash text not null,
  role text not null default 'student' check (role in ('student', 'dept_admin')),
  department_id uuid references departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));
create index users_department_idx on users (department_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null default now()
);

create table preferences (
  user_id uuid primary key references users (id) on delete cascade,
  daily_study_hours numeric(4, 2) not null default 3 check (daily_study_hours between 0 and 16),
  available_days smallint[] not null default '{0,1,2,3,4,5,6}',
  max_session_minutes integer not null default 90 check (max_session_minutes between 30 and 240),
  break_minutes integer not null default 10 check (break_minutes between 0 and 60),
  preferred_start_time time not null default '18:00',
  timezone text not null default 'UTC',
  -- reminders
  email_reminders boolean not null default false,
  push_reminders boolean not null default false,
  deadline_lead_hours integer[] not null default '{24,2}',
  session_reminders boolean not null default true,
  daily_digest boolean not null default false,
  updated_at timestamptz not null default now()
);

create table course_catalog (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id) on delete cascade,
  code text not null check (length(code) between 1 and 20),
  name text not null check (length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create unique index course_catalog_code_uq on course_catalog (department_id, lower(code));

create table course_reps (
  catalog_id uuid not null references course_catalog (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  assigned_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (catalog_id, user_id)
);
create index course_reps_user_idx on course_reps (user_id);

create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  catalog_id uuid references course_catalog (id) on delete set null,
  code text not null check (length(code) between 1 and 20),
  name text not null check (length(name) between 1 and 160),
  priority smallint not null default 3 check (priority between 1 and 5),
  rank integer,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index courses_user_code_uq on courses (user_id, lower(code));
create index courses_catalog_idx on courses (catalog_id);

create table shared_deadlines (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references course_catalog (id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  type text not null check (type in ('test', 'assignment', 'continuous_assessment', 'exam', 'project', 'other')),
  due_date date not null,
  due_time time,
  created_by uuid references users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shared_deadlines_catalog_idx on shared_deadlines (catalog_id, due_date);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  shared_deadline_id uuid references shared_deadlines (id) on delete set null,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 1000),
  type text not null check (type in ('test', 'assignment', 'continuous_assessment', 'exam', 'project', 'other')),
  due_date date not null,
  due_time time,
  estimated_hours numeric(5, 1) check (estimated_hours is null or (estimated_hours > 0 and estimated_hours <= 200)),
  importance smallint not null default 3 check (importance between 1 and 5),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed')),
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_due_idx on tasks (user_id, due_date);
create index tasks_course_idx on tasks (course_id);
create unique index tasks_user_shared_uq on tasks (user_id, shared_deadline_id) where shared_deadline_id is not null;

-- a student who deletes an adopted shared task is not given it again on the next sync
create table shared_dismissals (
  user_id uuid not null references users (id) on delete cascade,
  shared_deadline_id uuid not null references shared_deadlines (id) on delete cascade,
  primary key (user_id, shared_deadline_id)
);

create table study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  course_id uuid references courses (id) on delete set null,
  date date not null,
  starts_at timestamp not null,
  ends_at timestamp not null,
  minutes integer not null check (minutes > 0 and minutes <= 600),
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  reason text not null default '' check (length(reason) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index study_sessions_user_date_idx on study_sessions (user_id, date);
create index study_sessions_task_idx on study_sessions (task_id);

create table warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  key text not null check (length(key) <= 200),
  code text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  why text not null,
  course_id uuid,
  task_ids uuid[] not null default '{}',
  action_by text,
  next_step text not null default '',
  status text not null default 'active' check (status in ('active', 'dismissed', 'resolved')),
  dismissed_severity text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create index warnings_user_status_idx on warnings (user_id, status);
