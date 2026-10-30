// DB row -> API shape (matches docs/API_CONTRACT.md). Never leaks password hashes or storage internals.
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

export const course = (r) => ({ id: r.id, code: r.code, name: r.name, priority: r.priority, rank: r.rank ?? null, color: r.color ?? null, catalogId: r.catalog_id ?? null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export const task = (r) => ({
  id: r.id, courseId: r.course_id, title: r.title, description: r.description, type: r.type,
  dueDate: r.due_date, dueTime: r.due_time ?? null, estimatedHours: r.estimated_hours ?? null,
  importance: r.importance, status: r.status, completedAt: iso(r.completed_at),
  studiedHours: Math.round((Number(r.studied_hours) || 0) * 100) / 100,
  sharedDeadlineId: r.shared_deadline_id ?? null, version: r.version,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

export const session = (r) => ({ id: r.id, taskId: r.task_id, courseId: r.course_id ?? null, date: r.date, startsAt: r.starts_at, endsAt: r.ends_at, minutes: r.minutes, status: r.status, reason: r.reason, completedAt: iso(r.completed_at) });

export const warning = (r) => ({ id: r.id, key: r.key, code: r.code, severity: r.severity, title: r.title, why: r.why, courseId: r.course_id ?? null, taskIds: r.task_ids ?? [], actionBy: r.action_by ?? null, nextStep: r.next_step, status: r.status, dismissedSeverity: r.dismissed_severity ?? null, readAt: iso(r.read_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export const notification = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link ?? null, data: r.data ?? {}, readAt: iso(r.read_at), createdAt: iso(r.created_at) });

export const preferences = (r) => ({
  dailyStudyHours: Number(r.daily_study_hours), availableDays: r.available_days, maxSessionMinutes: r.max_session_minutes,
  breakMinutes: r.break_minutes, preferredStartTime: r.preferred_start_time, timezone: r.timezone,
  emailReminders: r.email_reminders, pushReminders: r.push_reminders, deadlineLeadHours: r.deadline_lead_hours,
  sessionReminders: r.session_reminders, dailyDigest: r.daily_digest,
});

export const shared = (r) => ({ id: r.id, catalogId: r.catalog_id, title: r.title, description: r.description, type: r.type, dueDate: r.due_date, dueTime: r.due_time ?? null, version: r.version, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export const material = (r) => ({
  id: r.id, courseId: r.course_id ?? null, title: r.title, notes: r.notes, tags: r.tags, filename: r.filename, mime: r.mime,
  sizeBytes: r.size_bytes, textExtracted: r.text_extracted, taskIds: r.task_ids ?? [], snippet: r.snippet ?? undefined,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});
