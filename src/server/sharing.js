// Course-rep shared deadlines: adoption into student tasks, sync on change, and notifications.

const FUTURE_WINDOW = "sd.due_date >= current_date - 1";

/** A student links a course to a catalog course: adopt its current shared deadlines as tasks. */
export async function adoptSharedForCourse(q, userId, courseId, catalogId) {
  const r = await q.query(
    `insert into tasks (user_id, course_id, shared_deadline_id, title, description, type, due_date, due_time)
     select $1, $2, sd.id, sd.title, sd.description, sd.type, sd.due_date, sd.due_time
       from shared_deadlines sd
      where sd.catalog_id = $3 and ${FUTURE_WINDOW}
        and not exists (select 1 from shared_dismissals x where x.user_id = $1 and x.shared_deadline_id = sd.id)
     on conflict (user_id, shared_deadline_id) where shared_deadline_id is not null do nothing
     returning id`,
    [userId, courseId, catalogId],
  );
  return r.rowCount;
}

/** A rep created a deadline: give it to every student who linked that catalog course. Returns user ids. */
export async function fanOutShared(q, sd) {
  const r = await q.query(
    `insert into tasks (user_id, course_id, shared_deadline_id, title, description, type, due_date, due_time)
     select c.user_id, c.id, $1, $2, $3, $4, $5, $6 from courses c
      where c.catalog_id = $7
        and not exists (select 1 from shared_dismissals x where x.user_id = c.user_id and x.shared_deadline_id = $1)
     on conflict (user_id, shared_deadline_id) where shared_deadline_id is not null do nothing
     returning user_id`,
    [sd.id, sd.title, sd.description, sd.type, sd.due_date, sd.due_time, sd.catalog_id],
  );
  return r.rows.map((x) => x.user_id);
}

/** A rep edited a deadline: update students' linked, unfinished tasks. Returns [{user_id, dateChanged}]. */
export async function syncSharedUpdate(q, sd) {
  const r = await q.query(
    `update tasks t set title = $2, description = $3, type = $4, due_date = $5, due_time = $6, version = t.version + 1, updated_at = now()
      where t.shared_deadline_id = $1 and t.status <> 'completed'
      returning t.user_id, (t.due_date is distinct from $5::date) as unused`,
    [sd.id, sd.title, sd.description, sd.type, sd.due_date, sd.due_time],
  );
  return [...new Set(r.rows.map((x) => x.user_id))];
}

export async function notifyUsers(q, userIds, { kind, title, body, link, data }) {
  if (!userIds.length) return;
  await q.query(
    `insert into notifications (user_id, kind, title, body, link, data)
     select u, $2, $3, $4, $5, $6::jsonb from unnest($1::uuid[]) as u`,
    [userIds, kind, title, body, link ?? null, JSON.stringify(data ?? {})],
  );
}
