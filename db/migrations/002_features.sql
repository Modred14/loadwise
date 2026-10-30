-- Server-originated notifications (e.g. a course rep changed a date). Separate from
-- `warnings`, which are regenerated from tasks by the engine and reconciled by key.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Study materials. File bytes live in material_blobs so listing metadata stays cheap.
create table materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  course_id uuid references courses (id) on delete set null,
  title text not null check (length(title) between 1 and 160),
  notes text not null default '' check (length(notes) <= 2000),
  tags text[] not null default '{}',
  filename text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  text_extracted boolean not null default false,
  extracted_text text not null default '',
  search tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materials_user_idx on materials (user_id, created_at desc);
create index materials_search_idx on materials using gin (search);
create index materials_course_idx on materials (course_id);

create table material_blobs (
  material_id uuid primary key references materials (id) on delete cascade,
  content bytea not null
);

-- Links attach to the TASK so they survive study-plan regeneration (which replaces sessions).
create table material_tasks (
  material_id uuid not null references materials (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  primary key (material_id, task_id)
);

create function materials_search_update() returns trigger language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.tags, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.notes, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(new.extracted_text, ''), 400000)), 'C');
  return new;
end $$;
create trigger materials_search_trg before insert or update of title, tags, notes, extracted_text
  on materials for each row execute function materials_search_update();

-- Workload history: one row per user per local day.
create table workload_snapshots (
  user_id uuid not null references users (id) on delete cascade,
  day date not null,
  score integer not null check (score between 0 and 100),
  category text not null check (category in ('low', 'medium', 'high', 'critical')),
  active_tasks integer not null,
  overdue_tasks integer not null,
  remaining_hours numeric(7, 1) not null,
  capacity_hours numeric(7, 1) not null,
  components jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Reminder outbox. (user, channel, ref_key) is unique so a reminder is never queued twice.
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  kind text not null check (kind in ('deadline', 'session', 'digest', 'test')),
  ref_key text not null,
  title text not null,
  body text not null,
  link text,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, channel, ref_key)
);
create index reminders_due_idx on reminders (send_at) where status = 'pending';

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);
